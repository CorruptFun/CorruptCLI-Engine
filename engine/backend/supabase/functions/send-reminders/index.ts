import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

serve(async (req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

    const now = new Date();
    // We want to find classes starting in exactly 3 hours (give or take a 1-hour window since we run this hourly)
    const targetStart = new Date(now.getTime() + 3 * 60 * 60 * 1000); 
    const windowEnd = new Date(targetStart.getTime() + 60 * 60 * 1000); // 1 hour window

    console.log(`Looking for classes between ${targetStart.toISOString()} and ${windowEnd.toISOString()}`);

    const { data: classes, error: classErr } = await supabaseAdmin
      .from('classes')
      .select('id, title, start_time')
      .gte('start_time', targetStart.toISOString())
      .lt('start_time', windowEnd.toISOString());

    if (classErr) throw classErr;
    if (!classes || classes.length === 0) {
      return new Response(JSON.stringify({ message: "No classes found in window" }), { status: 200 });
    }

    let emailsSent = 0;

    for (const cls of classes) {
      const { data: bookings, error: bookErr } = await supabaseAdmin
        .from('bookings')
        .select('guest_name, guest_email')
        .eq('class_id', cls.id)
        .neq('status', 'cancelled');

      if (bookErr) continue;
      
      if (bookings && bookings.length > 0) {
        const timeStr = new Date(cls.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        for (const booking of bookings) {
          if (!booking.guest_email) continue;
          
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
              to: [booking.guest_email],
              subject: `Reminder: ${cls.title} starts in 3 hours!`,
              html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                        <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Class Reminder</h1>
                      </div>
                      <div style="padding: 32px;">
                        <p style="font-size: 16px; line-height: 1.5;">Hi ${booking.guest_name || 'there'},</p>
                        <p style="font-size: 16px; line-height: 1.5;">This is a friendly reminder that your upcoming class is starting soon!</p>
                        
                        <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                          <p style="margin: 0 0 12px 0; font-size: 18px;"><strong>Class:</strong> ${cls.title}</p>
                          <p style="margin: 0; font-size: 16px;"><strong>Time:</strong> ${timeStr}</p>
                        </div>

                        <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">We look forward to seeing you at the studio. If you need to cancel, please log in or contact us as soon as possible.</p>
                      </div>
                     </div>`,
            }),
          });
          emailsSent++;
        }
      }
    }

    return new Response(JSON.stringify({ message: `Sent ${emailsSent} reminders` }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
});
