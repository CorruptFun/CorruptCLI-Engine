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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, record, old_record } = payload;

    if (type !== 'UPDATE') {
      return new Response(JSON.stringify({ message: 'Only UPDATE events handled' }), { status: 200 });
    }

    if (!old_record || !record) {
      return new Response(JSON.stringify({ message: 'Missing record or old_record in payload' }), { status: 200 });
    }

    const instructorChanged = record.instructor_name !== old_record.instructor_name;
    const statusChangedToCanceled = record.status === 'canceled' && old_record.status !== 'canceled';

    if (!instructorChanged && !statusChangedToCanceled) {
      return new Response(JSON.stringify({ message: 'No critical changes' }), { status: 200 });
    }

    console.log(`Processing class alert for: ${record.title}. Instructor change: ${instructorChanged}, Canceled: ${statusChangedToCanceled}`);

    // 1. Fetch all confirmed bookings for this class
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select('guest_email, guest_name')
      .eq('class_id', record.id)
      .eq('status', 'confirmed');

    if (bookingError) throw bookingError;

    if (!bookings || bookings.length === 0) {
      return new Response(JSON.stringify({ message: 'No bookings to notify' }), { status: 200 });
    }

    const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' };
    const classTime = new Date(record.start_time).toLocaleString('en-US', dateOpts);

    // 2. Notify Admin
    await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
            from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
            to: ["{{ADMIN_EMAIL}}"],
            subject: `📢 Class Update: ${record.title} (${classTime})`,
            html: `<p>A class you manage has been updated.</p>
                   <p><strong>Class:</strong> ${record.title}</p>
                   <p><strong>Time:</strong> ${classTime}</p>
                   <p><strong>Status:</strong> ${record.status}</p>
                   <p><strong>Instructor:</strong> ${record.instructor_name} (was: ${old_record.instructor_name})</p>
                   <p><strong>Notified Customers:</strong> ${bookings.length}</p>`
        })
    });

    // 3. Notify Customers (Batch)
    for (const booking of bookings) {
      if (!booking.guest_email) continue;

      let subject = "";
      let html = "";

      if (statusChangedToCanceled) {
        subject = `⚠️ Class Cancellation: ${record.title}`;
        html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 32px;">
                  <h2 style="color: #EF4444;">Class Cancellation Notice</h2>
                  <p>Hi ${booking.guest_name},</p>
                  <p>We're sorry to inform you that the following class has been <strong>canceled</strong>:</p>
                  <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                    <p style="margin: 0;"><strong>${record.title}</strong></p>
                    <p style="margin: 4px 0 0 0;">${classTime}</p>
                  </div>
                  <p>Any credits used for this booking have been returned to your account. We apologize for the inconvenience and hope to see you in another session soon!</p>
                  <p>Best,<br>The {{CLIENT_NAME}} Team</p>
                </div>`;
      } else if (instructorChanged) {
        subject = `📢 Instructor Change: ${record.title}`;
        html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 32px;">
                  <h2 style="color: #D4AF37;">Instructor Update</h2>
                  <p>Hi ${booking.guest_name},</p>
                  <p>We're writing to let you know that there has been an instructor change for your upcoming class:</p>
                  <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                    <p style="margin: 0;"><strong>${record.title}</strong></p>
                    <p style="margin: 4px 0 0 0;">${classTime}</p>
                    <p style="margin: 8px 0 0 0;">New Instructor: <strong>${record.instructor_name}</strong></p>
                  </div>
                  <p>Your booking remains confirmed. We can't wait to see you there!</p>
                  <p>Best,<br>The {{CLIENT_NAME}} Team</p>
                </div>`;
      }

      if (subject) {
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
                from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
                to: [booking.guest_email],
                subject: subject,
                html: html
            })
        });
      }
    }

    return new Response(JSON.stringify({ success: true, notified: bookings.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
