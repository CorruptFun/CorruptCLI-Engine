import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find users whose waiver was signed exactly 355 days ago (10 day warning before 365 expiration)
    // Or users whose waiver expired and need a hard reminder
    
    const today = new Date();
    const reminderDate = new Date(today);
    reminderDate.setDate(reminderDate.getDate() - 355);
    
    // Set to start of day and end of day for the target date to catch anyone who signed on that day
    const startOfDay = new Date(reminderDate.setHours(0,0,0,0)).toISOString();
    const endOfDay = new Date(reminderDate.setHours(23,59,59,999)).toISOString();

    const { data: usersToRemind, error } = await supabaseAdmin
        .from('customers')
        .select('email, name')
        .gte('waiver_signed_at', startOfDay)
        .lte('waiver_signed_at', endOfDay);

    if (error) throw error;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailsSent = 0;

    if (RESEND_API_KEY && usersToRemind && usersToRemind.length > 0) {
        for (const user of usersToRemind) {
            if (!user.email) continue;
            
            await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                    from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
                    to: [user.email],
                    subject: "Action Required: Annual Waiver Renewal",
                    html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                            <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                              <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Waiver Renewal</h1>
                            </div>
                            <div style="padding: 32px;">
                              <p style="font-size: 16px; line-height: 1.5;">Hi ${user.name},</p>
                              <p style="font-size: 16px; line-height: 1.5;">It has been almost a year since you signed your initial liability waiver with {{CLIENT_NAME}} Pilates.</p>
                              <p style="font-size: 16px; line-height: 1.5; font-weight: bold; color: #B91C1C;">For your safety and our studio compliance, we require all members to sign a fresh waiver every 12 months.</p>
                              
                              <div style="text-align: center; margin: 32px 0;">
                                <a href="https://www.{{CLIENT_DOMAIN}}/waiver.html?email=${encodeURIComponent(user.email)}" style="background-color: #111; color: #D4AF37; padding: 16px 32px; text-decoration: none; border-radius: 50px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Sign Renewal Waiver Now</a>
                              </div>

                              <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">If this is not completed within 10 days, you may not be permitted to attend your scheduled classes.</p>
                              <br/>
                              <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                            </div>
                           </div>`,
                }),
            });
            emailsSent++;
        }
    }

    return new Response(JSON.stringify({ success: true, processed: emailsSent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
