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
    const { type, table, record, old_record } = payload;

    let subject = "";
    let html = "";

    if (table === 'customers') {
      if (type === 'INSERT') {
        if (record.membership_type === 'Waitlist') {
          subject = `⏳ New Waitlist Entry: ${record.name || record.email}`;
          html = `<h3>New Waitlist Entry</h3>
                  <p><strong>Name:</strong> ${record.name}</p>
                  <p><strong>Email:</strong> ${record.email}</p>
                  <p><strong>Phone:</strong> ${record.phone}</p>
                  <p><strong>Goals:</strong> ${record.goals_medical || 'None'}</p>`;
        } else {
          subject = `👤 New Member Account: ${record.name || record.email}`;
          html = `<h3>New Customer Registered</h3>
                  <p><strong>Name:</strong> ${record.name}</p>
                  <p><strong>Email:</strong> ${record.email}</p>
                  <p><strong>Membership:</strong> ${record.membership_type || 'None'}</p>`;
        }
      } else if (type === 'UPDATE' && record.membership_type === 'Waitlist' && old_record.membership_type !== 'Waitlist') {
        subject = `⏳ New Waitlist Entry (Update): ${record.name || record.email}`;
        html = `<h3>Customer joined the waitlist</h3>
                <p><strong>Name:</strong> ${record.name}</p>
                <p><strong>Email:</strong> ${record.email}</p>`;
      } else if (type === 'UPDATE' && old_record.membership_type !== record.membership_type) {
        // Membership upgrade/change notification
        const inactiveTiers = ['None', 'Waitlist', 'A La Carte', null, undefined, ''];
        const wasInactive = inactiveTiers.includes(old_record.membership_type);
        const isNowActive = !inactiveTiers.includes(record.membership_type);
        
        if (wasInactive && isNowActive) {
          subject = `💰 Membership Upgrade: ${record.name || record.email} → ${record.membership_type}`;
          html = `<h3>Customer Upgraded to Paid Membership</h3>
                  <p><strong>Name:</strong> ${record.name}</p>
                  <p><strong>Email:</strong> ${record.email}</p>
                  <p><strong>Previous:</strong> ${old_record.membership_type || 'None'}</p>
                  <p><strong>New Plan:</strong> ${record.membership_type}</p>
                  <p><strong>Credits:</strong> ${record.class_credits || 0}</p>`;
        } else {
          subject = `🔄 Membership Changed: ${record.name || record.email} (${old_record.membership_type} → ${record.membership_type})`;
          html = `<h3>Membership Type Changed</h3>
                  <p><strong>Name:</strong> ${record.name}</p>
                  <p><strong>Email:</strong> ${record.email}</p>
                  <p><strong>From:</strong> ${old_record.membership_type}</p>
                  <p><strong>To:</strong> ${record.membership_type}</p>`;
        }
      }
    } else if (table === 'bookings' && type === 'INSERT') {
      subject = `🎟️ New Booking: ${record.guest_name || 'Unknown'}`;
      html = `<h3>New Booking Confirmed</h3>
              <p><strong>Guest:</strong> ${record.guest_name} (${record.guest_email})</p>
              <p><strong>Payment Method:</strong> ${record.payment_method}</p>
              <p><strong>Status:</strong> ${record.payment_status}</p>
              <p><strong>Class ID:</strong> ${record.class_id}</p>`;
    }

    if (subject) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "{{CLIENT_NAME}} Notifications <bookings@updates.{{CLIENT_DOMAIN}}>",
          to: ["{{ADMIN_EMAIL}}"],
          subject: subject,
          html: html,
        }),
      });
      
      const resData = await res.json();
      console.log("Resend response:", resData);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in admin-notification-webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
