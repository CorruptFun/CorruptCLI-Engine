import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe@14.14.0";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

    const now = new Date();
    
    // Calculate target dates
    const dateIn7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dateIn30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const formatted7Days = dateIn7Days.toISOString().split('T')[0];
    const formatted30Days = dateIn30Days.toISOString().split('T')[0];

    // Query 7-day targets
    const { data: targets7Day } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .eq('cancel_at_period_end', false)
      .eq('plan_interval', '1-month')
      .gte('current_period_end', `${formatted7Days}T00:00:00Z`)
      .lte('current_period_end', `${formatted7Days}T23:59:59Z`);

    // Query 30-day targets
    const { data: targets30Day } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .eq('cancel_at_period_end', false)
      .eq('plan_interval', '3-month')
      .gte('current_period_end', `${formatted30Days}T00:00:00Z`)
      .lte('current_period_end', `${formatted30Days}T23:59:59Z`);

    const allTargets = [
      ...(targets7Day?.map(t => ({ ...t, days: 7 })) || []),
      ...(targets30Day?.map(t => ({ ...t, days: 30 })) || [])
    ];

    let emailsSent = 0;

    for (const sub of allTargets) {
      const email = sub.email;
      if (!email) continue;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: 'https://{{CLIENT_DOMAIN}}/dashboard',
      });

      const firstName = sub.first_name || 'there';

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} Billing <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: `Your class pass renews in ${sub.days} days!`,
          html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                  <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                    <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Upcoming Renewal</h1>
                  </div>
                  <div style="padding: 32px;">
                    <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
                    <p style="font-size: 16px; line-height: 1.5;">Just a quick heads-up that your <strong>${sub.plan_interval} class pass</strong> will automatically renew in <strong>${sub.days} days</strong>.</p>
                    
                    <p style="font-size: 16px; line-height: 1.5;">You don't need to do anything to keep your spot! If you need to update your card on file or cancel your auto-renewal, you can manage your subscription instantly below.</p>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${portalSession.url}" style="display:inline-block;padding:14px 28px;background-color:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Manage Subscription</a>
                    </div>

                    <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">See you in class!</p>
                  </div>
                 </div>`,
        }),
      });
      emailsSent++;
    }

    return new Response(JSON.stringify({ success: true, emailsSent, targetsProcessed: allTargets.length }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Cron Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});