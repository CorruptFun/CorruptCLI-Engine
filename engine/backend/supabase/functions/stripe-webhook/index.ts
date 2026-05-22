import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@14.14.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return new Response("Webhook secret or signature missing", { status: 400 });
  }

  let event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          await supabaseAdmin.from('subscriptions').upsert({
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer as string,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
            user_id: subscription.metadata.user_id,
            email: subscription.metadata.email || invoice.customer_email || '',
            first_name: subscription.metadata.first_name || '',
            plan_interval: subscription.metadata.plan_interval || '1-month',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'stripe_subscription_id' });
        }
        break;
      }
      
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await supabaseAdmin.from('subscriptions').update({
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await supabaseAdmin.from('subscriptions').update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', invoice.subscription);
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Handle 1:1 Private Session Purchases
        if (session.metadata && session.metadata.type === 'one_on_one') {
          const { customer_email, customer_name, quantity, goal_summary } = session.metadata;
          const sessionCount = parseInt(quantity);

          const { data: existing } = await supabaseAdmin
            .from('customers')
            .select('one_on_one_credits')
            .eq('email', customer_email)
            .maybeSingle();

          const newTotal = (existing?.one_on_one_credits || 0) + sessionCount;

          await supabaseAdmin.from('customers').upsert({
            email: customer_email,
            name: customer_name,
            one_on_one_credits: newTotal,
            last_goal_summary: goal_summary,
            last_processed_session_id: session.id
          }, { onConflict: 'email' });

          // Trigger email to Admin and Customer via Edge Function (reusing booking-alert logic or similar)
          await supabaseAdmin.functions.invoke('booking-alert', {
            body: { 
              type: 'one_on_one_purchase',
              customer: { name: customer_name, email: customer_email },
              quantity: sessionCount,
              goalSummary: goal_summary
            }
          });
          break;
        }

        // Handle Membership / Class Experience Purchases
        if (session.metadata && session.metadata.tier && session.metadata.email) {
          const { tier, email, name } = session.metadata;
          
          // Fetch existing customer
          const { data: existingCustomer } = await supabaseAdmin
            .from('customers')
            .select('email, class_credits, last_processed_session_id')
            .eq('email', email)
            .maybeSingle();
            
          if (existingCustomer?.last_processed_session_id === session.id) {
            console.log("Session already processed:", session.id);
            break;
          }

          // Determine if this is an unlimited membership or a class experience pack
          const isUnlimitedMembership = tier.includes('Unlimited');
          const isClassPack = !isUnlimitedMembership && (tier.includes('Plan') || tier.includes('Experience'));

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

          // Calculate membership expiration
          let membershipExpiresAt = null;
          if (isUnlimitedMembership) {
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
              membershipExpiresAt = expDate.toISOString();
          }

          // Build the customer update payload
          const customerPayload: Record<string, any> = {
              email,
              name,
              last_processed_session_id: session.id,
          };

          if (isUnlimitedMembership) {
              // MEMBERSHIP: set tier + expiration, do NOT touch credits
              customerPayload.membership_type = tier;
              customerPayload.membership_expires_at = membershipExpiresAt;
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

          const { error } = await supabaseAdmin.from('customers').upsert(
              customerPayload, { onConflict: 'email' }
          );

          if (error) throw error;

          // --- EMAIL NOTIFICATIONS (Safety Net) ---
          const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
          if (RESEND_API_KEY) {
            const dateOpts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
            const displayExp = membershipExpiresAt
                ? new Date(membershipExpiresAt).toLocaleDateString('en-US', dateOpts)
                : 'N/A';
            const displayCredits = isClassPack ? (customerPayload.class_credits ?? 0) : 'Unlimited';

            // Customer Confirmation
            try {
              const emailSubject = isUnlimitedMembership
                  ? "Your {{CLIENT_NAME}} Membership is Confirmed!"
                  : `Your {{CLIENT_NAME}} ${tier} is Confirmed!`;
              const emailBody = isUnlimitedMembership
                  ? `Your <strong>${tier}</strong> membership has been activated. Valid until <strong>${displayExp}</strong>. You can now book classes freely — no credits needed.`
                  : `Your <strong>${tier}</strong> has been added to your account. You now have <strong>${displayCredits} class credits</strong> available (expires in 30 days).`;

              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
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
                            <br/><p style="font-size: 16px; font-weight: bold;">- The {{CLIENT_NAME}} Team</p>
                          </div>
                         </div>`
                })
              });
            } catch (emailErr) {
              console.error("Stripe webhook customer email failed:", emailErr);
            }

            // Admin Alert
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
                body: JSON.stringify({
                  from: "{{CLIENT_NAME}} System <bookings@updates.{{CLIENT_DOMAIN}}>",
                  to: ["{{ADMIN_EMAIL}}"],
                  subject: `💰 Purchase (Stripe Webhook): ${name} — ${tier}`,
                  html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                      <h3 style="color: #059669;">${isUnlimitedMembership ? 'Membership' : 'Class Pack'} Processed via Stripe Webhook</h3>
                      <p><strong>Customer:</strong> ${name} (${email})</p>
                      <p><strong>Plan:</strong> ${tier}</p>
                      <p><strong>${isUnlimitedMembership ? 'Access:' : 'Credits:'}</strong> ${displayCredits}</p>
                      <p><strong>Valid Until:</strong> ${displayExp}</p>
                      <p style="font-size: 12px; color: #777;">Stripe Session: ${session.id}</p>
                    </div>`
                })
              });
            } catch (emailErr) {
              console.error("Stripe webhook admin email failed:", emailErr);
            }
          }
          // --- END EMAIL NOTIFICATIONS ---
        }

        // Handle Single-Class Stripe Bookings (safety net)
        // If user closes the tab after paying but before redirect,
        // this ensures the booking gets marked as paid
        if (session.metadata?.booking_id && !session.metadata?.type && !session.metadata?.tier) {
          const bookingId = session.metadata.booking_id;
          
          const { data: booking } = await supabaseAdmin
            .from('bookings')
            .select('id, payment_status')
            .eq('id', bookingId)
            .maybeSingle();

          if (booking && booking.payment_status !== 'paid') {
            const { error: updateErr } = await supabaseAdmin
              .from('bookings')
              .update({ payment_status: 'paid' })
              .eq('id', bookingId);

            if (updateErr) {
              console.error(`Failed to update booking ${bookingId}:`, updateErr.message);
            } else {
              console.log(`Webhook safety-net: Marked booking ${bookingId} as paid`);
            }
          }
        }

        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error(`Database Error: ${err.message}`);
    return new Response(`Database Error: ${err.message}`, { status: 500 });
  }
});