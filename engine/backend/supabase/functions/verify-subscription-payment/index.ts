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
    const { session_id, tier, email, name, preferred_time } = await req.json();

    if (!session_id || !tier || !email) {
      throw new Error("Missing required parameters");
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['total_details.breakdown.discounts.discount.promotion_code']
    });

    if (session.payment_status === 'paid') {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Check for Promo Code
      let usedPromo1M = false;
      let usedPromo3M = false;

      if (session.total_details && session.total_details.breakdown && session.total_details.breakdown.discounts) {
          for (const d of session.total_details.breakdown.discounts) {
              if (d.discount && d.discount.promotion_code && d.discount.promotion_code.code) {
                  const code = d.discount.promotion_code.code.toUpperCase();
                  if (code === 'FIRST5-1M') usedPromo1M = true;
                  if (code === 'FIRST5-3M') usedPromo3M = true;
              }
          }
      }

      // Calculate expiration
      let expiresAt = null;
      const now = new Date();
      if (tier.includes('1 Month')) {
          now.setMonth(now.getMonth() + 1);
          expiresAt = now.toISOString();
      } else if (tier.includes('3 Months')) {
          now.setMonth(now.getMonth() + 3);
          expiresAt = now.toISOString();
      } else if (tier.includes('Plan')) {
          now.setMonth(now.getMonth() + 1); // 30 days for Class Plans
          expiresAt = now.toISOString();
      }

      // We should check if customer exists to avoid overwriting their phone/address
      const { data: existingCustomer } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      const customerPayload: any = {
          email: email,
          name: name,
          membership_type: tier,
          membership_expires_at: expiresAt,
      };

      if (!existingCustomer) {
          customerPayload.phone = '';
          customerPayload.sex = '';
          customerPayload.address = '';
      }

      if (usedPromo3M) {
          customerPayload.first5_3m_claimed = true;
      }

      // Upsert Customer
      const { error } = await supabaseAdmin.from('customers').upsert(customerPayload);

      if (error) throw error;
      
      // Auto-book preferred time slot
      if (preferred_time) {
          try {
              let daysToBook = 30;
              if (tier.includes('3 Months')) daysToBook = 90;
              
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
                      const bookingsToInsert = toBook.map(c => ({
                          class_id: c.id,
                          guest_name: name,
                          guest_email: email,
                          payment_method: 'cash',
                          payment_status: 'paid'
                      }));
                      
                      // Ignore duplicates/conflicts silently
                      await supabaseAdmin.from('bookings').insert(bookingsToInsert);
                  }
              }
          } catch(err) {
              console.error("Auto-booking failed", err);
          }
      }
      
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

      if (RESEND_API_KEY) {
          const dateOpts: any = { month: 'long', day: 'numeric', year: 'numeric' };
          const formattedExp = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', dateOpts) : 'N/A';
          
          let promoMessageHtml = '';
          if (usedPromo1M) {
              promoMessageHtml = `
              <div style="background-color: #FEF3C7; padding: 16px; border-radius: 4px; margin: 16px 0; border-left: 4px solid #F59E0B;">
                  <p style="margin: 0; font-size: 16px; color: #92400E;"><strong>Congratulations!</strong> You successfully claimed the "First 5" 1-Month Promotion.</p>
              </div>`;
          } else if (usedPromo3M) {
              promoMessageHtml = `
              <div style="background-color: #FEF3C7; padding: 16px; border-radius: 4px; margin: 16px 0; border-left: 4px solid #F59E0B;">
                  <p style="margin: 0; font-size: 16px; color: #92400E;"><strong>Congratulations!</strong> You successfully claimed the "First 5" 3-Month Promotion. You've unlocked <strong>three free 1:1 sessions</strong>! Our team will reach out shortly to schedule your sessions.</p>
              </div>`;
          }

          await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                  from: "SaaS Boilerplate <bookings@updates.yourdomain.com>",
                  to: [email],
                  subject: "Your SaaS Boilerplate Membership is Confirmed!",
                  html: `<div style="font-family: sans-serif; color: #111; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                          <div style="background-color: #D4AF37; padding: 32px; text-align: center;">
                            <h1 style="margin: 0; color: #111; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Membership Active!</h1>
                          </div>
                          <div style="padding: 32px;">
                            <p style="font-size: 16px; line-height: 1.5;">Hi ${name},</p>
                            <p style="font-size: 16px; line-height: 1.5;">Thank you for your purchase. Your membership has been successfully applied to your account.</p>
                            
                            ${promoMessageHtml}

                            <div style="background-color: #F9FAFB; padding: 24px; border-radius: 4px; margin: 24px 0;">
                              <p style="margin: 0 0 12px 0; font-size: 18px;"><strong>Plan:</strong> ${tier}</p>
                              <p style="margin: 0; font-size: 16px;"><strong>Valid Until:</strong> ${formattedExp}</p>
                            </div>

                            <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">You can now freely book classes without paying a drop-in fee by selecting the "In-Organization" payment option at checkout.</p>
                            <br/>
                            <p style="font-size: 16px; font-weight: bold; margin: 0;">- The SaaS Boilerplate Team</p>
                          </div>
                         </div>`,
              }),
          });
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
