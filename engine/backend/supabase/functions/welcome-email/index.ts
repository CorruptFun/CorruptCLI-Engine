import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload.record; // The new customer row

    if (!record.email || !record.name) {
        throw new Error("Missing email or name");
    }

    const firstName = record.name.split(' ')[0];

    const htmlContent = `
    <div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
        <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Welcome to the Studio!</h1>
      </div>
      <div style="padding: 32px;">
        <p style="font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>
        <p style="font-size: 16px; line-height: 1.6;">We are absolutely thrilled to welcome you to {{CLIENT_NAME}}! We cannot wait to begin your pilates journey with you.</p>
        <p style="font-size: 16px; line-height: 1.6;">Our studio is an empowering space to build long, lean muscles and center the mind in an environment crafted for your transformation.</p>
        
        <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0; border-left: 4px solid #D4AF37;">
          <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Don't Miss Out</h3>
          <p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px 0;">To make sure you are the first to know about schedule drops, exclusive memberships, and studio updates, please complete these quick steps:</p>
          <ul style="font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
            <li><strong>Whitelist our email:</strong> Add <em>bookings@updates.{{CLIENT_DOMAIN}}</em> to your safe sender list/VIP contacts so we never go to spam.</li>
            <li><strong>Turn on notifications:</strong> Follow us and turn on post notifications on Instagram <a href="https://www.instagram.com/{{CLIENT_DOMAIN}}" target="_blank" style="color: #D4AF37;">@{{CLIENT_DOMAIN}}</a>.</li>
            <li><strong>Join the community:</strong> Like our page on <a href="{{CLIENT_FACEBOOK_URL}}" target="_blank" style="color: #D4AF37;">Facebook</a>.</li>
          </ul>
        </div>

        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">See you on the reformer soon,</p>
        <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
      </div>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
        to: [record.email],
        subject: "Welcome to {{CLIENT_NAME}} Pilates! ✨",
        html: htmlContent,
      }),
    });
    
    // --- NEW: ADMIN NOTIFICATION ALERT ---
    try {
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
                to: ["{{ADMIN_EMAIL}}"],
                subject: `🚨 New Lead: ${record.name} Sign-up`,
                html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #D4AF37;">New User Capture Alert</h2>
                    <p>A new user has entered their details on the site. This lead has been saved to the database regardless of payment status.</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${record.name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${record.email}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${record.phone || 'Not provided'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Address:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${record.address || 'Not provided'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Context/Goals:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${record.fitness_goals || record.goals_medical || 'General signup'}</td></tr>
                    </table>
                    <p style="margin-top: 20px; font-size: 12px; color: #777;">This is an automated capture. If they don't complete their membership purchase within 24 hours, you may want to follow up with them directly.</p>
                </div>`
            }),
        });
    } catch (adminErr) {
        console.error("Admin notification failed:", adminErr);
    }
    // --- END ADMIN NOTIFICATION ---

    const data = await res.json();

    return new Response(JSON.stringify({ success: true, resend: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
