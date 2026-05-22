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

// Pricing Map
const PRICING: Record<string, {amount: number, name: string}> = {
    '4 Class Plan': { amount: 11500, name: '4 Class Plan' },
    '4 Class Experience': { amount: 11500, name: '4 Class Plan' },
    '6 Class Plan': { amount: 16500, name: '6 Class Plan' },
    '6 Class Experience': { amount: 16500, name: '6 Class Plan' },
    '8 Class Plan': { amount: 22500, name: '8 Class Plan' },
    '8 Class Experience': { amount: 22500, name: '8 Class Plan' },
    '12 Class Plan': { amount: 34500, name: '12 Class Plan' },
    '12 Class Experience': { amount: 34500, name: '12 Class Plan' },
    '1 Month Unlimited': { amount: 46000, name: '1 Month Unlimited' },
    '3 Months Unlimited': { amount: 60000, name: '3 Months Unlimited' },
    '6 Months Unlimited': { amount: 110000, name: '6 Months Unlimited' },
    '12 Months Unlimited': { amount: 200000, name: '12 Months Unlimited' }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name, email, tier, preferred_time } = await req.json();

    if (!name || !email || !tier) {
      throw new Error("Missing required fields");
    }

    // --- NEW: DATA CAPTURE (Lead Generation) ---
    // Initialize Supabase admin client to capture the user even if payment fails/abandons
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch existing status
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('membership_type')
      .eq('email', email)
      .maybeSingle();

    // Only set to Waitlist if they are new or have no active membership
    const currentStatus = existing?.membership_type || 'None';
    const isNewOrInactive = ['None', 'Waitlist', 'A La Carte'].includes(currentStatus);

    // Save lead data to customers table — only set fitness_goals for new customers
    const leadPayload: Record<string, any> = {
        email: email,
        name: name,
        membership_type: isNewOrInactive ? 'Waitlist' : currentStatus,
    };
    // Only set fitness_goals if they don't already have them (prevents overwriting waiver data)
    if (!existing) {
        leadPayload.fitness_goals = `Interested in: ${tier}${preferred_time ? ' (Time: ' + preferred_time + ')' : ''}`;
    }
    const { error: upsertError } = await supabaseAdmin
      .from('customers')
      .upsert(leadPayload, { onConflict: 'email' });

    if (upsertError) {
      console.error("Data capture (upsert) failed:", upsertError);
      // We continue to checkout even if capture fails to avoid blocking the user
    }
    // --- END DATA CAPTURE ---

    const plan = PRICING[tier];
    if (!plan) throw new Error("Invalid membership tier");

    try {
        // 1. Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          customer_email: email,
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `{{CLIENT_NAME}}: ${plan.name}`,
                  description: `Access to {{CLIENT_NAME}} Pilates Studio`,
                },
                unit_amount: plan.amount,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${req.headers.get('origin') || 'https://www.{{CLIENT_DOMAIN}}'}?mem_session_id={CHECKOUT_SESSION_ID}&tier=${encodeURIComponent(tier)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&preferred_time=${encodeURIComponent(preferred_time || '')}`,
          cancel_url: `${req.headers.get('origin') || 'https://www.{{CLIENT_DOMAIN}}'}?mem_cancel=true`,
          metadata: {
            tier: tier,
            email: email,
            name: name,
            preferred_time: preferred_time || ""
          },
        });

        return new Response(JSON.stringify({ url: session.url }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
    } catch (stripeError) {
        console.error("Stripe Session Creation Error:", stripeError);
        
        // Log to our new error_logs table
        await supabaseAdmin.from('error_logs').insert([{
            source: 'edge-function',
            context: 'stripe-membership-checkout',
            message: stripeError.message,
            stack: stripeError.stack,
            metadata: { tier, email, name, preferred_time }
        }]);

        throw stripeError;
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});