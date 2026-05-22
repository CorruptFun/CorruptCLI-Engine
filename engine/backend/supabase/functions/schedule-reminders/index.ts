import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

    console.log("Running proactive member reminders check...");
    let totalEmailsSent = 0;
    const sentToEmails = new Set<string>();

    // 1. Fetch all active members or customers with credits
    // Filter for people who should be booking (exclude instructors/admins if needed, but here we look for credits/memberships)
    const { data: activeMembers, error: memberError } = await supabaseAdmin
        .from('customers')
        .select('email, name, class_credits, membership_type')
        .or('class_credits.gt.0,membership_type.not.eq.None,membership_type.not.is.null');

    if (memberError) throw memberError;

    console.log(`Found ${activeMembers?.length || 0} active members to check.`);

    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
    
    const nextMonth = new Date();
    nextMonth.setDate(now.getDate() + 30);

    for (const member of (activeMembers || [])) {
        if (!member.email) continue;

        // Fetch upcoming confirmed bookings for this member
        const { data: memberBookings, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .select(`
                id,
                status,
                classes (
                    start_time,
                    title
                )
            `)
            .eq('guest_email', member.email)
            .eq('status', 'confirmed');

        if (bookingError) {
            console.error(`Error fetching bookings for ${member.email}:`, bookingError);
            continue;
        }

        const futureBookings = (memberBookings || [])
            .map(b => {
                const c = Array.isArray(b.classes) ? b.classes[0] : b.classes;
                return c?.start_time ? new Date(c.start_time) : null;
            })
            .filter(d => d !== null && d > now) as Date[];
        
        const hasTomorrow = futureBookings.some(d => d.toDateString() === tomorrow.toDateString());
        const hasNextWeek = futureBookings.some(d => d <= nextWeek);
        const hasNextMonth = futureBookings.some(d => d <= nextMonth);

        const credits = member.class_credits || 0;
        const isMember = member.membership_type && !['None', 'Waitlist', 'Expired'].includes(member.membership_type);

        let subject = "";
        let body = "";
        let tier = "";

        // Tiered Logic for Gaps
        if (!hasTomorrow && credits > 0) {
            tier = "24h";
            subject = "Ready for your reformer tomorrow? 🩰";
            body = `<p>Hi ${member.name || 'Member'},</p>
                    <p>We noticed you don't have a class scheduled for tomorrow. We still have a few reformers open!</p>
                    <p>You have <strong>${credits} sessions</strong> available in your account. Don't let your streak break—book your spot now.</p>`;
        } else if (!hasNextWeek && (credits > 0 || isMember)) {
            tier = "7d";
            subject = "Plan your progress for next week! ✨";
            body = `<p>Hi ${member.name || 'Member'},</p>
                    <p>Your schedule for next week is looking a bit empty. To reach your fitness goals, consistency is everything.</p>
                    <p>Take a moment to secure your preferred times for the coming week before they fill up.</p>`;
        } else if (!hasNextMonth && isMember) {
            tier = "30d";
            subject = "Lock in your monthly lineup 📅";
            body = `<p>Hi ${member.name || 'Member'},</p>
                    <p>Consistency is the secret to Pilates results. We noticed you haven't booked any classes for the next 30 days.</p>
                    <p>As a member, you have priority access to the schedule. Secure your favorite times and instructors now!</p>`;
        }

        if (subject && !sentToEmails.has(member.email)) {
            try {
                await sendEmail(RESEND_API_KEY, member.email, subject, body);
                sentToEmails.add(member.email);
                totalEmailsSent++;
                console.log(`Sent ${tier} reminder to ${member.email}`);
            } catch (e) {
                console.error(`Failed to send email to ${member.email}:`, e);
            }
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        emailsSent: totalEmailsSent,
        timestamp: new Date().toISOString()
    }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("Reminder function error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function sendEmail(apiKey: string, to: string, subject: string, body: string) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
            to: [to],
            subject: subject,
            html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; background-color: #fff;">
                    <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                        <h1 style="margin: 0; color: #111; font-size: 20px; text-transform: uppercase; letter-spacing: 2px;">{{CLIENT_NAME}} Pilates</h1>
                    </div>
                    <div style="padding: 32px; line-height: 1.6;">
                        ${body}
                        <div style="margin-top: 32px; text-align: center;">
                            <a href="https://{{CLIENT_DOMAIN}}/member-schedule.html" style="background-color: #111; color: #D4AF37; padding: 16px 32px; border-radius: 99px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase; display: inline-block;">Schedule Now</a>
                        </div>
                        <p style="margin-top: 32px; font-size: 14px; color: #6B7280; text-align: center;">
                          See you in the studio soon!<br/>
                          <strong>The {{CLIENT_NAME}} Team</strong>
                        </p>
                    </div>
                    <div style="padding: 16px 32px; border-top: 1px solid #E5E7EB; text-align: center;">
                        <p style="font-size: 11px; color: #9CA3AF; margin: 0;">
                            You're receiving this because you have an active membership or class credits at {{CLIENT_NAME}} Pilates.<br/>
                            <a href="mailto:{{ADMIN_EMAIL}}?subject=Unsubscribe%20from%20scheduling%20reminders&body=Please%20remove%20me%20from%20scheduling%20reminder%20emails.%20Email%3A%20${to}" style="color: #9CA3AF; text-decoration: underline;">Unsubscribe from reminders</a>
                        </p>
                    </div>
                   </div>`,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend API error: ${err}`);
    }
}
