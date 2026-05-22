import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'npm:stripe@14.18.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Full pricing map — memberships + class packs + 1:1 sessions
const PRICING: Record<string, { amount: number; name: string; type: string }> = {
  '4 Class Plan':       { amount: 11500, name: '4 Class Plan',       type: 'membership' },
  '6 Class Plan':       { amount: 16500, name: '6 Class Plan',       type: 'membership' },
  '8 Class Plan':       { amount: 22500, name: '8 Class Plan',       type: 'membership' },
  '12 Class Plan':      { amount: 34500, name: '12 Class Plan',      type: 'membership' },
  '1 Month Unlimited':  { amount: 46000, name: '1 Month Unlimited',  type: 'membership' },
  '3 Months Unlimited': { amount: 60000, name: '3 Months Unlimited', type: 'membership' },
  '6 Months Unlimited': { amount: 110000, name: '6 Months Unlimited', type: 'membership' },
  '12 Months Unlimited': { amount: 200000, name: '12 Months Unlimited', type: 'membership' },
  '1:1 Session (1x)':   { amount: 7500,  name: '1:1 Session (1x)',   type: '1on1' },
  '1:1 Sessions (3x)':  { amount: 22500, name: '1:1 Sessions (3x)',  type: '1on1' },
  '1:1 Sessions (5x)':  { amount: 37500, name: '1:1 Sessions (5x)',  type: '1on1' },
};

// Credit map — how many credits each plan grants
const CREDIT_MAP: Record<string, number> = {
  '4 Class Plan': 4,
  '6 Class Plan': 6,
  '8 Class Plan': 8,
  '12 Class Plan': 12,
};

const ONE_ON_ONE_MAP: Record<string, number> = {
  '1:1 Session (1x)': 1,
  '1:1 Sessions (3x)': 3,
  '1:1 Sessions (5x)': 5,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, name, tier, payment_method } = await req.json();

    if (!email || !name || !tier) {
      throw new Error("Missing required fields: email, name, tier");
    }

    const plan = PRICING[tier];
    if (!plan) {
      throw new Error(`Unknown plan: ${tier}`);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const priceFormatted = `$${(plan.amount / 100).toFixed(0)}`;
    const dateOpts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const today = new Date().toLocaleDateString('en-US', dateOpts);

    // ==========================================
    // CASH PATH — Send receipt for cash payment
    // ==========================================
    if (payment_method === 'cash') {
      const isOneOnOne = plan.type === '1on1';
      const credits = CREDIT_MAP[tier] || 0;
      const oneOnOneCredits = ONE_ON_ONE_MAP[tier] || 0;

      if (RESEND_API_KEY) {
        // Send receipt to customer
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "{{CLIENT_NAME}} Pilates <bookings@updates.{{CLIENT_DOMAIN}}>",
            to: [email],
            subject: `Payment Received — ${plan.name} | {{CLIENT_NAME}} Pilates`,
            html: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #fff; border-radius: 16px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #D4AF37, #B8962E); padding: 32px; text-align: center;">
                  <h1 style="margin: 0; font-size: 28px; color: #111; letter-spacing: 2px;">{{CLIENT_NAME}}</h1>
                  <p style="margin: 8px 0 0; color: #333; font-size: 14px;">PILATES STUDIO</p>
                </div>
                <div style="padding: 32px;">
                  <p style="color: #ccc; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
                  <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
                    This confirms your payment has been received. Here are the details of your purchase:
                  </p>
                  <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 24px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 0;">Plan</td>
                        <td style="color: #D4AF37; font-size: 16px; font-weight: bold; text-align: right; padding: 8px 0;">${plan.name}</td>
                      </tr>
                      <tr>
                        <td style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 0;">Amount Paid</td>
                        <td style="color: #fff; font-size: 16px; font-weight: bold; text-align: right; padding: 8px 0;">${priceFormatted}</td>
                      </tr>
                      <tr>
                        <td style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 0;">Payment Method</td>
                        <td style="color: #fff; font-size: 14px; text-align: right; padding: 8px 0;">Cash / In-Person</td>
                      </tr>
                      <tr>
                        <td style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 0;">Date</td>
                        <td style="color: #fff; font-size: 14px; text-align: right; padding: 8px 0;">${today}</td>
                      </tr>
                      ${!isOneOnOne ? `<tr>
                        <td style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 0;">Credits Added</td>
                        <td style="color: #D4AF37; font-size: 16px; font-weight: bold; text-align: right; padding: 8px 0;">${tier.includes('Unlimited') ? 'Unlimited Access' : credits + ' credits'}</td>
                      </tr>` : `<tr>
                        <td style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 0;">1:1 Sessions</td>
                        <td style="color: #D4AF37; font-size: 16px; font-weight: bold; text-align: right; padding: 8px 0;">${oneOnOneCredits}</td>
                      </tr>`}
                    </table>
                  </div>
                  <p style="color: #888; font-size: 14px; line-height: 1.6;">
                    You're all set to book classes! Visit <a href="https://www.{{CLIENT_DOMAIN}}" style="color: #D4AF37; text-decoration: none;">{{CLIENT_DOMAIN}}</a> to view the schedule.
                  </p>
                </div>
                <div style="background: #0a0a0a; padding: 20px; text-align: center; border-top: 1px solid #222;">
                  <p style="color: #555; font-size: 11px; margin: 0;">{{CLIENT_NAME}} Pilates · San Antonio, TX</p>
                </div>
              </div>
            `,
          }),
        });
      }

      return new Response(
        JSON.stringify({ success: true, type: 'cash_receipt' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ==========================================
    // STRIPE PATH — Create checkout + send link
    // ==========================================
    const isOneOnOne = plan.type === '1on1';
    const sessionCount = ONE_ON_ONE_MAP[tier] || 0;

    const metadata: Record<string, string> = {
      email,
      name,
      tier,
      admin_initiated: 'true',
    };

    if (isOneOnOne) {
      metadata.customer_email = email;
      metadata.customer_name = name;
      metadata.quantity = String(sessionCount);
      metadata.goal_summary = 'Admin assigned';
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: plan.name },
          unit_amount: plan.amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata,
      success_url: `https://www.{{CLIENT_DOMAIN}}/?payment=success&tier=${encodeURIComponent(tier)}`,
      cancel_url: `https://www.{{CLIENT_DOMAIN}}/?payment=cancelled`,
    });

    // Send payment link email via Resend
    if (RESEND_API_KEY && session.url) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} Pilates <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: `Your ${plan.name} Invoice — {{CLIENT_NAME}} Pilates`,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #fff; border-radius: 16px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #D4AF37, #B8962E); padding: 32px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px; color: #111; letter-spacing: 2px;">{{CLIENT_NAME}}</h1>
                <p style="margin: 8px 0 0; color: #333; font-size: 14px;">PILATES STUDIO</p>
              </div>
              <div style="padding: 32px;">
                <p style="color: #ccc; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
                <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
                  Your instructor has set up your <strong style="color: #D4AF37;">${plan.name}</strong> package. 
                  Please click the button below to complete your payment of <strong style="color: #D4AF37;">${priceFormatted}</strong>.
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${session.url}" style="display: inline-block; background: #D4AF37; color: #111; text-decoration: none; padding: 16px 48px; border-radius: 50px; font-weight: bold; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">
                    Complete Payment
                  </a>
                </div>
                <p style="color: #666; font-size: 13px; text-align: center;">
                  This link expires in 24 hours. If you have any questions, reply to this email or contact us at {{ADMIN_EMAIL}}.
                </p>
              </div>
              <div style="background: #0a0a0a; padding: 20px; text-align: center; border-top: 1px solid #222;">
                <p style="color: #555; font-size: 11px; margin: 0;">{{CLIENT_NAME}} Pilates · San Antonio, TX</p>
              </div>
            </div>
          `,
        }),
      });

      // Also notify admin
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: ["{{ADMIN_EMAIL}}"],
          subject: `Invoice Sent: ${plan.name} for ${name}`,
          html: `
            <p>An invoice for <strong>${plan.name}</strong> (${priceFormatted}) has been sent to <strong>${name}</strong> (${email}).</p>
            <p>Stripe Checkout Session: ${session.id}</p>
            <p>Payment link: <a href="${session.url}">${session.url}</a></p>
          `,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error("Admin billing error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
