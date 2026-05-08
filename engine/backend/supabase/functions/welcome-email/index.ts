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
        <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Welcome to the Organization!</h1>
      </div>
      <div style="padding: 32px;">
        <p style="font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>
        <p style="font-size: 16px; line-height: 1.6;">We are absolutely thrilled to welcome you to SaaS Boilerplate! We cannot wait to begin your service journey with you.</p>
        <p style="font-size: 16px; line-height: 1.6;">Our organization is an empowering space to build long, lean muscles and center the mind in an environment crafted for your transformation.</p>
        
        <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0; border-left: 4px solid #D4AF37;">
          <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Don't Miss Out</h3>
          <p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px 0;">To make sure you are the first to know about schedule drops, exclusive memberships, and organization updates, please complete these quick steps:</p>
          <ul style="font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
            <li><strong>Whitelist our email:</strong> Add <em>bookings@updates.yourdomain.com</em> to your safe sender list/VIP contacts so we never go to spam.</li>
            <li><strong>Turn on notifications:</strong> Follow us and turn on post notifications on Instagram <a href="https://www.instagram.com/yourdomain.com" target="_blank" style="color: #D4AF37;">@yourdomain.com</a>.</li>
            <li><strong>Join the community:</strong> Like our page on <a href="https://www.facebook.com/people/SaaS Boilerplate-Service/61580673279828/" target="_blank" style="color: #D4AF37;">Facebook</a>.</li>
          </ul>
        </div>

        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">See you on the equipment soon,</p>
        <p style="font-size: 16px; font-weight: bold; margin: 0;">- The SaaS Boilerplate Team</p>
      </div>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SaaS Boilerplate <bookings@updates.yourdomain.com>",
        to: [record.email],
        subject: "Welcome to SaaS Boilerplate Service! ✨",
        html: htmlContent,
      }),
    });
    
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
