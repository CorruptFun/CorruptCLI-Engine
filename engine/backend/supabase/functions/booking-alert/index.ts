import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function checkAndSendWaiver(email: string, name: string) {
  if (!email) return;
  const { data: customerData } = await supabase
    .from('customers')
    .select('waiver_signed_at')
    .eq('email', email)
    .maybeSingle();

  const needsWaiver = !customerData?.waiver_signed_at || 
    (new Date(customerData.waiver_signed_at).getTime() < (Date.now() - 365 * 24 * 60 * 60 * 1000));

  if (needsWaiver) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
        to: [email],
        subject: "Action Required: Sign your {{CLIENT_NAME}} Waiver",
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 32px;">
                <h2 style="color: #D4AF37;">Almost there, ${name}!</h2>
                <p>We noticed your liability waiver hasn't been signed yet. To ensure your spot on the reformer is secured, please take 1 minute to sign the digital waiver below.</p>
                <div style="margin: 32px 0; text-align: center;">
                  <a href="https://{{CLIENT_DOMAIN}}/waiver.html?email=${encodeURIComponent(email)}" style="background-color: #111; color: #D4AF37; padding: 16px 32px; border-radius: 99px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase;">Sign Waiver</a>
                </div>
                <p>See you in the studio soon!</p>
                <p>Best,<br>The {{CLIENT_NAME}} Team</p>
               </div>`
      })
    });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const type = payload.type; // 'INSERT', 'UPDATE', 'DELETE' or manual type

    if (payload.type === 'send_manual_confirmation') {
      const { email, name, message, className, classTime } = payload;
      const displayClassName = className || 'Your Class';
      const displayClassTime = classTime || 'See details below';
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: "Quick Update: Your {{CLIENT_NAME}} Booking & Schedule Access ✨",
          html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                  <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                    <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Schedule Fixed!</h1>
                  </div>
                  <div style="padding: 32px;">
                    <p style="font-size: 16px; line-height: 1.5;">Hi ${name},</p>
                    <p style="font-size: 16px; line-height: 1.5;">${message}</p>
                    
                    <p style="font-size: 16px; font-weight: bold; margin-top: 24px;">Current Confirmed Spot:</p>
                    <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 16px 0;">
                      <p style="margin: 0 0 12px 0; font-size: 18px;"><strong>Class:</strong> ${displayClassName}</p>
                      <p style="margin: 0; font-size: 16px;"><strong>When:</strong> ${displayClassTime}</p>
                    </div>

                    <div style="margin: 32px 0; text-align: center;">
                      <a href="https://{{CLIENT_DOMAIN}}/member-schedule.html?email=${encodeURIComponent(email)}" style="background-color: #111; color: #D4AF37; padding: 18px 36px; border-radius: 99px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Return to Scheduler</a>
                    </div>

                    <p style="font-size: 16px; line-height: 1.5;">See you in the studio soon!</p>
                    <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                  </div>
                 </div>`
        })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- CREDITS DEPLETED NOTIFICATION ---
    if (payload.type === 'credits_depleted') {
      const { email, name } = payload;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} Pilates <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: "You've Used Your Last Class Credit! 🎉",
          html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #fff; border-radius: 16px; overflow: hidden;">
                  <div style="background: linear-gradient(135deg, #D4AF37, #B8962E); padding: 32px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; color: #111; letter-spacing: 2px;">{{CLIENT_NAME}}</h1>
                    <p style="margin: 8px 0 0; color: #333; font-size: 14px;">PILATES STUDIO</p>
                  </div>
                  <div style="padding: 32px;">
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
                      You've just booked your last class credit — great job staying consistent! 💪
                    </p>
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
                      To keep your momentum going, grab a new class experience pack or upgrade to an unlimited membership:
                    </p>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="https://www.{{CLIENT_DOMAIN}}/#pricing" style="display: inline-block; background: #D4AF37; color: #111; text-decoration: none; padding: 16px 48px; border-radius: 50px; font-weight: bold; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">
                        View Plans
                      </a>
                    </div>
                    <p style="color: #888; font-size: 14px; line-height: 1.6;">
                      You can still book individual classes anytime — just pay per class from the schedule. But a class pack or membership saves you money and keeps your spot reserved!
                    </p>
                  </div>
                  <div style="background: #0a0a0a; padding: 20px; text-align: center; border-top: 1px solid #222;">
                    <p style="color: #555; font-size: 11px; margin: 0;">{{CLIENT_NAME}} Pilates · San Antonio, TX</p>
                  </div>
                </div>`
        })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- NO-SHOW NOTIFICATION ---
    if (payload.type === 'no_show') {
      const { email, name, className, classTime, paymentMethod, paymentStatus } = payload;

      // Payment-method-specific messaging
      let impactMessage = '';
      let actionMessage = '';
      
      if (paymentMethod === 'credits') {
        impactMessage = 'Your class credit for this session has been used and is <strong>non-refundable</strong>.';
        actionMessage = 'If you have remaining credits, you can book another class from our schedule.';
      } else if (paymentMethod === 'stripe') {
        impactMessage = 'Your payment for this class is <strong>non-refundable</strong> per our cancellation policy.';
        actionMessage = 'To avoid this in the future, please cancel at least 24 hours before class time.';
      } else if (paymentMethod === 'membership') {
        impactMessage = 'As an unlimited member, there is no financial penalty — but your reserved spot could have gone to another student.';
        actionMessage = 'Please cancel at least 24 hours in advance if you cannot attend so others can book.';
      } else {
        // Cash / studio — they haven't paid yet, fee is still owed
        impactMessage = 'The class fee for this session is <strong>still owed</strong> and must be settled before your next booking.';
        actionMessage = 'Please contact the studio or pay online to clear your balance.';
      }

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} Pilates <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: `Missed Class: ${className}`,
          html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #fff; border-radius: 16px; overflow: hidden;">
                  <div style="background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 32px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; color: #fff; letter-spacing: 2px;">Missed Class</h1>
                    <p style="margin: 8px 0 0; color: rgba(255,255,255,0.7); font-size: 14px;">{{CLIENT_NAME}}</p>
                  </div>
                  <div style="padding: 32px;">
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
                      We noticed you didn't make it to your reserved class:
                    </p>
                    <div style="background: #1a1a1a; border-left: 4px solid #ef4444; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
                      <p style="margin: 0; color: #fff; font-size: 18px; font-weight: bold;">${className}</p>
                      <p style="margin: 4px 0 0; color: #888; font-size: 14px;">${classTime}</p>
                    </div>
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">${impactMessage}</p>
                    <p style="color: #888; font-size: 14px; line-height: 1.6;">${actionMessage}</p>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="https://www.{{CLIENT_DOMAIN}}/#schedule" style="display: inline-block; background: #D4AF37; color: #111; text-decoration: none; padding: 14px 40px; border-radius: 50px; font-weight: bold; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
                        Book Another Class
                      </a>
                    </div>
                    <p style="color: #555; font-size: 12px; line-height: 1.5; border-top: 1px solid #222; padding-top: 16px;">
                      <strong>Cancellation Policy:</strong> All cancellations must be made at least 24 hours before the scheduled class time. Late cancellations and no-shows are subject to the full class fee.
                    </p>
                  </div>
                  <div style="background: #0a0a0a; padding: 20px; text-align: center; border-top: 1px solid #222;">
                    <p style="color: #555; font-size: 11px; margin: 0;">{{CLIENT_NAME}} Pilates · San Antonio, TX</p>
                  </div>
                </div>`
        })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- BALANCE CLEARED RECEIPT ---
    if (payload.type === 'balance_cleared') {
      const { email, name, count } = payload;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} Pilates <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: "Balance Settled ✓ — You're All Set!",
          html: `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #fff; border-radius: 16px; overflow: hidden;">
                  <div style="background: linear-gradient(135deg, #22c55e, #16a34a); padding: 32px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; color: #fff; letter-spacing: 2px;">Balance Settled</h1>
                    <p style="margin: 8px 0 0; color: rgba(255,255,255,0.7); font-size: 14px;">{{CLIENT_NAME}}</p>
                  </div>
                  <div style="padding: 32px;">
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">Hi ${name},</p>
                    <p style="color: #ccc; font-size: 16px; line-height: 1.6;">
                      Your outstanding balance of <strong>${count} class${count > 1 ? 'es' : ''}</strong> has been settled. You're all clear!
                    </p>
                    <p style="color: #888; font-size: 14px; line-height: 1.6;">
                      You can now book classes again from our schedule. We look forward to seeing you on the reformer!
                    </p>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="https://www.{{CLIENT_DOMAIN}}/#schedule" style="display: inline-block; background: #D4AF37; color: #111; text-decoration: none; padding: 14px 40px; border-radius: 50px; font-weight: bold; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
                        Book a Class
                      </a>
                    </div>
                  </div>
                  <div style="background: #0a0a0a; padding: 20px; text-align: center; border-top: 1px solid #222;">
                    <p style="color: #555; font-size: 11px; margin: 0;">{{CLIENT_NAME}} Pilates · San Antonio, TX</p>
                  </div>
                </div>`
        })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (payload.type === 'send_waiver_link') {
      const { email, name } = payload;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: "Action Required: Sign your {{CLIENT_NAME}} Waiver",
          html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 32px;">
                  <h2 style="color: #D4AF37;">Almost there, ${name}!</h2>
                  <p>We noticed your liability waiver hasn't been signed yet. To ensure your spot on the reformer is secured, please take 1 minute to sign the digital waiver below.</p>
                  <div style="margin: 32px 0; text-align: center;">
                    <a href="https://{{CLIENT_DOMAIN}}/waiver.html?email=${encodeURIComponent(email)}" style="background-color: #111; color: #D4AF37; padding: 16px 32px; border-radius: 99px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase;">Sign Waiver</a>
                  </div>
                  <p>See you in the studio soon!</p>
                  <p>Best,<br>The {{CLIENT_NAME}} Team</p>
                 </div>`
        })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- 1:1 SESSION SCHEDULED NOTIFICATION ---
    if (payload.type === 'one_on_one_scheduled') {
      const { customerEmail, sessions } = payload;

      // Look up customer name
      const { data: customer } = await supabase
        .from('customers')
        .select('name')
        .eq('email', customerEmail)
        .maybeSingle();

      const firstName = customer?.name?.split(' ')[0] || 'there';

      const sessionListHtml = (sessions || []).map((s: any, idx: number) => {
        const d = new Date(s.start_time);
        const dateStr = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
        return `<tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #222; color: #D4AF37; font-weight: bold;">${idx + 1}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #222; color: #ccc;">${dateStr}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #222; color: #ccc;">${timeStr}</td>
        </tr>`;
      }).join('');

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [customerEmail],
          subject: `Your 1:1 Sessions Are Scheduled! 🎯`,
          html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                  <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                    <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Sessions Confirmed</h1>
                  </div>
                  <div style="padding: 32px;">
                    <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
                    <p style="font-size: 16px; line-height: 1.5;">Great news! Your private 1-on-1 sessions have been scheduled. Here's your lineup:</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 24px 0; background: #0a0a0a; border-radius: 8px; overflow: hidden;">
                      <thead>
                        <tr style="border-bottom: 2px solid #D4AF37;">
                          <th style="padding: 12px 16px; text-align: left; color: #D4AF37; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">#</th>
                          <th style="padding: 12px 16px; text-align: left; color: #D4AF37; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Date</th>
                          <th style="padding: 12px 16px; text-align: left; color: #D4AF37; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${sessionListHtml}
                      </tbody>
                    </table>

                    <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">If you need to reschedule, please contact us at least 24 hours in advance at {{ADMIN_EMAIL}}.</p>
                    <br/>
                    <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                  </div>
                 </div>`
        })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (payload.type === 'send_enrollment_link') {
      const { email, name } = payload;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: [email],
          subject: "Action Required: Schedule your {{CLIENT_NAME}} Classes! ✨",
          html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                  <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                    <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Time to Book!</h1>
                  </div>
                  <div style="padding: 32px;">
                    <p style="font-size: 16px; line-height: 1.6;">Hi ${name},</p>
                    <p style="font-size: 16px; line-height: 1.6;">Your membership is active and your credits are ready to use. It's time to secure your spot on the reformer!</p>
                    
                    <div style="margin: 32px 0; text-align: center;">
                      <a href="https://{{CLIENT_DOMAIN}}/member-schedule.html?email=${encodeURIComponent(email)}" style="background-color: #111; color: #D4AF37; padding: 18px 36px; border-radius: 99px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">View Schedule & Book</a>
                    </div>

                    <p style="font-size: 14px; color: #666; line-height: 1.5;">Simply click the button above to view available dates and select your classes. Your credits will be automatically applied at checkout.</p>
                    <p style="font-size: 16px; line-height: 1.5; margin-top: 24px;">See you in the studio soon!</p>
                    <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                  </div>
                 </div>`
        })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === 'one_on_one_purchase') {
      const { customer, quantity, goalSummary } = payload;
      const customerName = customer?.name || 'Valued Client';
      const customerEmail = customer?.email;

      // 1. Admin Notification
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: ["{{ADMIN_EMAIL}}"],
          subject: `🎯 New 1:1 Purchase: ${customerName} (${quantity} sessions)`,
          html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                  <h2 style="color: #059669; margin-top: 0;">✅ 1:1 Private Session Purchase</h2>
                  <table style="width: 100%; border-collapse: collapse;">
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Customer:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${customerName}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${customerEmail}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Sessions Purchased:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${quantity}</td></tr>
                      <tr><td style="padding: 8px;"><strong>Goals:</strong></td><td style="padding: 8px;">${goalSummary || 'Not specified'}</td></tr>
                  </table>
                  <p style="margin-top: 16px; font-size: 14px; color: #D97706; font-weight: bold;">⚠️ ACTION REQUIRED: Please reach out to ${customerName} within 24 hours to schedule their sessions.</p>
                </div>`
        })
      });

      // 2. Customer Confirmation
      if (customerEmail) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
            to: [customerEmail],
            subject: "Your 1:1 Private Sessions are Confirmed! 🎉",
            html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                      <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Sessions Confirmed!</h1>
                    </div>
                    <div style="padding: 32px;">
                      <p style="font-size: 16px; line-height: 1.5;">Hi ${customerName},</p>
                      <p style="font-size: 16px; line-height: 1.5;">Thank you for purchasing <strong>${quantity} private 1:1 session${quantity > 1 ? 's' : ''}</strong>. We are so excited to work with you on your personal Pilates journey!</p>
                      
                      <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                        <p style="margin: 0 0 12px 0; font-size: 18px;"><strong>Sessions:</strong> ${quantity}x Private 1:1 Pilates</p>
                        <p style="margin: 0; font-size: 16px;"><strong>Your Goals:</strong> ${goalSummary || 'To be discussed'}</p>
                      </div>

                      <p style="font-size: 16px; line-height: 1.5;">A {{CLIENT_NAME}} instructor will reach out within <strong>24 hours</strong> to schedule your sessions at a time that works best for you.</p>
                      <br/>
                      <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                    </div>
                   </div>`
          })
        });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Handle Database Webhooks (INSERT, UPDATE, DELETE)
    const record = payload.record;
    const oldRecord = payload.old_record;

    // 1. Handle CANCELLATIONS (Update to 'cancelled' or DELETE)
    if ((type === 'UPDATE' && record.status === 'cancelled' && oldRecord.status !== 'cancelled') || type === 'DELETE') {
      const activeRecord = record || oldRecord;

      // Fetch class details
      const { data: classData } = await supabase
        .from('classes')
        .select('title, start_time')
        .eq('id', activeRecord.class_id)
        .single();

      const time = new Date(classData?.start_time).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      
      const startTime = new Date(classData?.start_time);
      const isLateCancellation = (startTime.getTime() - new Date().getTime()) / (1000 * 60 * 60) < 24;

      // Credit Refund is now handled securely by database trigger (tr_refund_credits)

      // Admin Alert: User Cancelled
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: ["{{ADMIN_EMAIL}}"],
          subject: `${isLateCancellation ? '⚠️ LATE ' : ''}Cancellation: ${activeRecord.guest_name} for ${classData?.title}`,
          html: `<p>A customer has canceled their booking.</p>
                 ${isLateCancellation ? '<p style="color: #EF4444; font-weight: bold; font-size: 18px;">⚠️ LATE CANCELLATION (Less than 24h notice)</p>' : ''}
                 <p><strong>Customer:</strong> ${activeRecord.guest_name} (${activeRecord.guest_email})</p>
                 <p><strong>Class:</strong> ${classData?.title}</p>
                 <p><strong>Original Time:</strong> ${time}</p>
                 <p><strong>Credit Status:</strong> ${isLateCancellation ? 'NOT refunded automatically' : 'Refunded automatically'}</p>`
        })
      });

      // Customer Confirmation: You Cancelled
      if (activeRecord.guest_email) {
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
                from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
                to: [activeRecord.guest_email],
                subject: "Booking Cancellation Confirmed",
                html: `<p>Hi ${activeRecord.guest_name},</p>
                       <p>This email confirms that your booking for <strong>${classData?.title}</strong> on ${time} has been canceled.</p>
                       <p>If this was a mistake, you can jump back onto the schedule to book a new slot.</p>
                       <p>See you soon,<br>The {{CLIENT_NAME}} Team</p>`
            })
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Cancellation processed' }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 1b. Handle STRIPE PAYMENT CONFIRMED (payment_status: pending → paid)
    if (type === 'UPDATE' && record.payment_status === 'paid' && oldRecord?.payment_status === 'pending' && record.payment_method === 'stripe') {
        const { data: classData } = await supabase
          .from('classes')
          .select('title, start_time, instructor_name')
          .eq('id', record.class_id)
          .single();

        if (classData && record.guest_email) {
            const dateOpts2: Intl.DateTimeFormatOptions = { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
            const formattedTime2 = new Date(classData.start_time).toLocaleString('en-US', dateOpts2);

            await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
                body: JSON.stringify({
                    from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
                    to: [record.guest_email],
                    subject: "Your {{CLIENT_NAME}} Pilates Booking is Confirmed!",
                    html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                            <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                              <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">You're Booked!</h1>
                            </div>
                            <div style="padding: 32px;">
                              <p style="font-size: 16px; line-height: 1.5;">Hi ${record.guest_name},</p>
                              <p style="font-size: 16px; line-height: 1.5;">Payment received! Your spot on the reformer is confirmed.</p>
                              
                              <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 18px;"><strong>Class:</strong> ${classData.title}</p>
                                <p style="margin: 0 0 12px 0; font-size: 16px;"><strong>Instructor:</strong> ${classData.instructor_name}</p>
                                <p style="margin: 0; font-size: 16px;"><strong>When:</strong> ${formattedTime2}</p>
                              </div>

                              <p style="font-size: 16px; color: #059669; margin: 24px 0;">✅ Your class has been paid for online. You're all set!</p>
                              <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">Please arrive 10 minutes early. Grip socks are required.</p>
                              <br/>
                              <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                            </div>
                           </div>`,
                }),
            });
        }

        await checkAndSendWaiver(record.guest_email, record.guest_name);

        return new Response(JSON.stringify({ success: true, message: 'Stripe payment confirmed' }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 2. Handle NEW BOOKINGS (INSERT)
    if (type === 'INSERT' || !type) {
        // Credit Deduction is now handled securely by database trigger (tr_deduct_credits)

        // Fetch class details
        const { data: classData, error: classError } = await supabase
          .from('classes')
          .select('title, start_time, end_time, instructor_name, price')
          .eq('id', record.class_id)
          .single();

        if (classError) throw classError;

        // Format dates nicely
        const dateOpts: Intl.DateTimeFormatOptions = { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
        const formattedTime = new Date(classData.start_time).toLocaleString('en-US', dateOpts);

        const isCash = record.payment_method === 'cash';
        const isCoveredByPlan = record.payment_method === 'membership' || record.payment_method === 'credits';
        const priceText = classData.price ? `$${classData.price}` : '$30';
        
        let adminPaymentAlert;
        let guestPaymentNote;

        if (isCash) {
            adminPaymentAlert = `<p style="color: #D97706; font-weight: bold; font-size: 18px;">🚨 PAYMENT PENDING: CASH CUSTOMER (${priceText} due at studio)</p>`;
            guestPaymentNote = `<p style="font-size: 16px; font-weight: bold; color: #D97706; border-left: 4px solid #D97706; padding-left: 12px; margin: 24px 0;">Please remember to bring your ${priceText} payment to the studio upon arrival.</p>`;
        } else if (isCoveredByPlan) {
            const planLabel = record.payment_method === 'membership' ? 'Membership' : 'Class Credits';
            adminPaymentAlert = `<p style="color: #2563EB; font-weight: bold;">✅ COVERED BY ${planLabel.toUpperCase()}</p>`;
            guestPaymentNote = `<p style="font-size: 16px; color: #2563EB; margin: 24px 0;">This class is covered by your <strong>${planLabel}</strong>. No additional payment needed!</p>`;
        } else if (record.payment_status === 'paid') {
            adminPaymentAlert = `<p style="color: #059669; font-weight: bold;">✅ PAID ONLINE</p>`;
            guestPaymentNote = `<p style="font-size: 16px; color: #059669; margin: 24px 0;">Your class has been paid for online. You're all set!</p>`;
        } else {
            adminPaymentAlert = `<p style="color: #D97706; font-weight: bold;">⏳ PENDING STRIPE PAYMENT</p>`;
            guestPaymentNote = `<p style="font-size: 16px; color: #D97706; margin: 24px 0;">Your payment is being processed. You'll receive a confirmation once it's complete.</p>`;
        }

        // 1. Email to the Admin ({{ADMIN_EMAIL}})
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
            to: ["{{ADMIN_EMAIL}}"],
            subject: `${isCash ? '🚨 [CASH] ' : '🎉 '}New Booking: ${record.guest_name} for ${classData.title}`,
            html: `${adminPaymentAlert}
                   <p>You have a new booking!</p>
                   <p><strong>Customer:</strong> ${record.guest_name} (${record.guest_email})</p>
                   <p><strong>Class:</strong> ${classData.title} with ${classData.instructor_name}</p>
                   <p><strong>Time:</strong> ${formattedTime}</p>`,
          }),
        });

        // 2. Email to the Customer — but NOT for pending Stripe bookings
        // Stripe bookings start as 'pending' before payment; the customer gets their
        // confirmation after verify-payment updates it to 'paid' (handled by the UPDATE webhook path)
        const isPendingStripe = record.payment_method === 'stripe' && record.payment_status === 'pending';
        if (record.guest_email && !isPendingStripe) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
              from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
              to: [record.guest_email],
              subject: "Your {{CLIENT_NAME}} Pilates Booking is Confirmed!",
              html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                        <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">You're Booked!</h1>
                      </div>
                      <div style="padding: 32px;">
                        <p style="font-size: 16px; line-height: 1.5;">Hi ${record.guest_name},</p>
                        <p style="font-size: 16px; line-height: 1.5;">Your spot on the reformer is confirmed. We can't wait to see you in the studio!</p>
                        
                        <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                          <p style="margin: 0 0 12px 0; font-size: 18px;"><strong>Class:</strong> ${classData.title}</p>
                          <p style="margin: 0 0 12px 0; font-size: 16px;"><strong>Instructor:</strong> ${classData.instructor_name}</p>
                          <p style="margin: 0; font-size: 16px;"><strong>When:</strong> ${formattedTime}</p>
                        </div>

                        ${guestPaymentNote}

                        <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">Please arrive 10 minutes early. Grip socks are required.</p>
                        <br/>
                        <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                      </div>
                     </div>`,
            }),
          });
        }

        if (!isPendingStripe) {
          await checkAndSendWaiver(record.guest_email, record.guest_name);
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    return new Response(JSON.stringify({ success: true, message: 'No action taken' }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});