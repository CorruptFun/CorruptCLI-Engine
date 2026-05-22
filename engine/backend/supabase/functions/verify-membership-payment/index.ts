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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { session_id, tier, email, name, preferred_time, quantity } = await req.json();

    if (!session_id || !tier || !email) {
      throw new Error("Missing required parameters");
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // --- IDEMPOTENCY CHECK ---
      const { data: alreadyProcessed } = await supabaseAdmin
        .from('customers')
        .select('email, waiver_signed_at')
        .eq('last_processed_session_id', session_id)
        .maybeSingle();

      if (alreadyProcessed) {
        return new Response(JSON.stringify({ 
          status: 'already_processed', 
          message: "Payment already recorded" 
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        });
      }
      // --- END IDEMPOTENCY ---

      // Determine if this is an unlimited membership or a class experience pack
      const isUnlimitedMembership = tier.includes('Unlimited');
      const isClassPack = !isUnlimitedMembership && (tier.includes('Plan') || tier.includes('Experience'));
      const isOneOnOne = tier === 'one_on_one';

      // Credit mapping — ONLY for class experience packs (NOT memberships)
      const CREDIT_MAP: Record<string, number> = {
          '4 Class Experience': 4,
          '4 Class Plan': 4,
          '6 Class Experience': 6,
          '6 Class Plan': 6,
          '8 Class Experience': 8,
          '8 Class Plan': 8,
          '12 Class Experience': 12,
          '12 Class Plan': 12,
      };

      // We should check if customer exists to avoid overwriting their phone/address
      const { data: existingCustomer } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      // Build the customer update payload
      const customerPayload: any = {
          email: email,
          name: name,
          last_processed_session_id: session_id
      };

      if (!existingCustomer) {
          customerPayload.phone = '';
          customerPayload.sex = '';
          customerPayload.address = '';
      }

      if (isOneOnOne) {
          // 1:1 PRIVATE SESSION PURCHASE: increment one_on_one_credits
          const qty = quantity || parseInt(session.metadata?.quantity || '1');
          const currentOneOnOne = existingCustomer?.one_on_one_credits || 0;
          customerPayload.one_on_one_credits = currentOneOnOne + qty;
          // Don't change membership_type — 1:1 is independent of class membership
      } else if (isUnlimitedMembership) {
          // MEMBERSHIP: set tier + expiration, do NOT touch credits
          const expDate = new Date();
          if (tier.includes('12 Months')) {
              expDate.setMonth(expDate.getMonth() + 12);
          } else if (tier.includes('6 Months')) {
              expDate.setMonth(expDate.getMonth() + 6);
          } else if (tier.includes('3 Months')) {
              expDate.setMonth(expDate.getMonth() + 3);
          } else {
              expDate.setMonth(expDate.getMonth() + 1);
          }
          customerPayload.membership_type = tier;
          customerPayload.membership_expires_at = expDate.toISOString();
          // Explicitly zero out credits — members don't use the credit system
          customerPayload.class_credits = 0;
          customerPayload.credits_expires_at = null;
      } else if (isClassPack) {
          // CLASS EXPERIENCE PACK: add credits, set 30-day expiry
          const creditsToAdd = CREDIT_MAP[tier] || 0;
          const newCredits = (existingCustomer?.class_credits || 0) + creditsToAdd;
          const credExpDate = new Date();
          credExpDate.setDate(credExpDate.getDate() + 30);

          // Only set to 'A La Carte' if they don't already have an active unlimited membership
          const existingType = existingCustomer?.membership_type || '';
          const isCurrentlyUnlimited = existingType.includes('Unlimited') || existingType === 'Founder';
          if (!isCurrentlyUnlimited) {
              customerPayload.membership_type = 'A La Carte';
          }
          customerPayload.class_credits = newCredits;
          customerPayload.credits_expires_at = credExpDate.toISOString();
      }

      // Upsert Customer
      const { error } = await supabaseAdmin.from('customers').upsert(customerPayload, { onConflict: 'email' });

      if (error) throw error;
      
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

      // --- WAIVER & NOTIFICATION EMAILS ---
      if (RESEND_API_KEY) {
          if (isOneOnOne) {
              // 1:1 purchases get a different notification — no waiver email needed here
              const qty = quantity || parseInt(session.metadata?.quantity || '1');
              const goalSummary = session.metadata?.goal_summary || 'Not specified';

              // Trigger booking-alert for 1:1 purchase (admin + customer notification)
              try {
                  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/booking-alert`, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                      },
                      body: JSON.stringify({
                          type: 'one_on_one_purchase',
                          customer: { name, email },
                          quantity: qty,
                          goalSummary
                      })
                  });
              } catch(e) { console.error('1:1 notification failed:', e); }
          } else {
              // Membership/credit pack purchases get waiver email
              await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${RESEND_API_KEY}`,
                  },
                  body: JSON.stringify({
                      from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
                      to: [email],
                      subject: "Action Required: Sign Your Waiver ✍️",
                      html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                              <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                                <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Welcome to {{CLIENT_NAME}}!</h1>
                              </div>
                              <div style="padding: 32px;">
                                <p style="font-size: 16px; line-height: 1.5;">Hi ${name},</p>
                                <p style="font-size: 16px; line-height: 1.5;">We are so excited to have you in the studio! To ensure a smooth first session, please complete your profile and sign your annual liability waiver before your first class.</p>
                                
                                <div style="text-align: center; margin: 32px 0;">
                                    <a href="https://www.{{CLIENT_DOMAIN}}/waiver.html?email=${encodeURIComponent(email)}" style="background-color: #D4AF37; color: #111; padding: 16px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">Sign Waiver & Complete Profile</a>
                                </div>

                                <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">Completing this now will save time at check-in so you can focus entirely on your workout.</p>
                                <br/>
                                <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                              </div>
                             </div>`,
                  }),
              });
          }
      }
      // --- END EMAILS ---
      
      // Auto-book preferred time slot
      if (preferred_time) {
          try {
              let daysToBook = 30;
              if (tier.includes('12 Months')) daysToBook = 365;
              else if (tier.includes('6 Months')) daysToBook = 180;
              else if (tier.includes('3 Months')) daysToBook = 90;
              
              const startDate = new Date();
              const endDate = new Date();
              endDate.setDate(startDate.getDate() + daysToBook);
              
              const { data: matchedClasses, error: classErr } = await supabaseAdmin
                  .from('classes')
                  .select('id, start_time')
                  .gte('start_time', startDate.toISOString())
                  .lte('start_time', endDate.toISOString());
                  
              if (!classErr && matchedClasses) {
                  const toBook = matchedClasses.filter(c => {
                      const d = new Date(c.start_time);
                      const hours = d.getHours().toString().padStart(2, '0');
                      const mins = d.getMinutes().toString().padStart(2, '0');
                      const timeStr = `${hours}:${mins}`;
                      return timeStr === preferred_time;
                  });
                  
                  if (toBook.length > 0) {
                      // Insert one-by-one so a duplicate in one class doesn't kill the rest
                      for (const c of toBook) {
                          try {
                              await supabaseAdmin.from('bookings').insert({
                                  class_id: c.id,
                                  guest_name: name,
                                  guest_email: email,
                                  payment_method: 'membership',
                                  payment_status: 'paid'
                              });
                          } catch(_) { /* skip duplicates/full classes */ }
                      }
                  }
              }
          } catch(err) {
              console.error("Auto-booking failed", err);
          }
      }
      
      const RESEND_API_KEY_LOCAL = Deno.env.get("RESEND_API_KEY");

      if (RESEND_API_KEY_LOCAL && !isOneOnOne) {
          const dateOpts: any = { month: 'long', day: 'numeric', year: 'numeric' };
          const displayExp = customerPayload.membership_expires_at
              ? new Date(customerPayload.membership_expires_at).toLocaleDateString('en-US', dateOpts)
              : (customerPayload.credits_expires_at
                  ? new Date(customerPayload.credits_expires_at).toLocaleDateString('en-US', dateOpts)
                  : 'N/A');
          const displayCredits = isClassPack ? (customerPayload.class_credits ?? 0) : 'Unlimited';

          const emailSubject = isUnlimitedMembership
              ? "Your {{CLIENT_NAME}} Membership is Confirmed!"
              : `Your {{CLIENT_NAME}} ${tier} is Confirmed!`;
          const emailBody = isUnlimitedMembership
              ? `Thank you for your purchase. Your <strong>${tier}</strong> membership has been activated. Valid until <strong>${displayExp}</strong>. You can now book classes freely — no credits needed.`
              : `Your <strong>${tier}</strong> has been added to your account. You now have <strong>${displayCredits} class credits</strong> available (expires ${displayExp}).`;

          const custEmailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${RESEND_API_KEY_LOCAL}`,
              },
              body: JSON.stringify({
                  from: "{{CLIENT_NAME}} <bookings@updates.{{CLIENT_DOMAIN}}>",
                  to: [email],
                  subject: emailSubject,
                  html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                          <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                            <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">${isUnlimitedMembership ? 'Membership Active!' : 'Credits Added!'}</h1>
                          </div>
                          <div style="padding: 32px;">
                            <p style="font-size: 16px; line-height: 1.5;">Hi ${name},</p>
                            <p style="font-size: 16px; line-height: 1.5;">${emailBody}</p>
                            <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                              <p style="margin: 0 0 12px 0; font-size: 18px;"><strong>Plan:</strong> ${tier}</p>
                              <p style="margin: 0; font-size: 16px;"><strong>${isUnlimitedMembership ? 'Valid Until:' : 'Credits Expire:'}</strong> ${displayExp}</p>
                            </div>
                            <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">${isUnlimitedMembership
                                ? 'You can now freely book classes by selecting "Use Membership" at checkout.'
                                : 'Select "Use Class Credits" when booking to apply your credits.'}</p>
                            <br/>
                            <p style="font-size: 16px; font-weight: bold; margin: 0;">- The {{CLIENT_NAME}} Team</p>
                          </div>
                         </div>`,
              }),
          });

          if (!custEmailRes.ok) {
              console.error("Customer confirmation email failed:", await custEmailRes.text());
          }

          // --- ADMIN NOTIFICATION ---
          const adminEmailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${RESEND_API_KEY_LOCAL}`,
              },
              body: JSON.stringify({
                  from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
                  to: ["{{ADMIN_EMAIL}}"],
                  subject: `💰 New Purchase: ${name} — ${tier}`,
                  html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                      <h2 style="color: #059669; margin-top: 0;">✅ ${isUnlimitedMembership ? 'Membership' : 'Class Pack'} Purchase Confirmed</h2>
                      <table style="width: 100%; border-collapse: collapse;">
                          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Customer:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td></tr>
                          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
                          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Plan:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${tier}</td></tr>
                          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${isUnlimitedMembership ? 'Access:' : 'Credits:'}</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayCredits}</td></tr>
                          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Valid Until:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayExp}</td></tr>
                          <tr><td style="padding: 8px;"><strong>Preferred Time:</strong></td><td style="padding: 8px;">${preferred_time || 'Not specified'}</td></tr>
                      </table>
                      <p style="margin-top: 16px; font-size: 12px; color: #777;">Stripe Session: ${session_id}</p>
                  </div>`,
              }),
          });

          if (!adminEmailRes.ok) {
              console.error("Admin notification email failed:", await adminEmailRes.text());
          }
          // --- END ADMIN NOTIFICATION ---
      }

      return new Response(JSON.stringify({ status: 'success' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      return new Response(JSON.stringify({ status: 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
