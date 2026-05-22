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
    const { quantity, goalSummary, name, email } = await req.json();

    if (!quantity || !name || !email) {
      throw new Error("Missing required fields");
    }

    const sessionCount = parseInt(quantity);
    const unitPrice = 75; // $75 per 1:1 session (standard boutique pricing)

    // Initialize Supabase admin client to ensure customer exists
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Ensure they are in the customers table (without downgrading active members)
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('membership_type')
      .eq('email', email)
      .maybeSingle();

    const currentStatus = existing?.membership_type || 'None';
    const isNewOrInactive = ['None', 'Waitlist', 'A La Carte'].includes(currentStatus);

    await supabaseAdmin
      .from('customers')
      .upsert({
        email: email,
        name: name,
        membership_type: isNewOrInactive ? 'Waitlist' : currentStatus
      }, { onConflict: 'email' });

    // Create Stripe Checkout Session for 1:1
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `{{CLIENT_NAME}} 1:1 Private Sessions (Pack of ${sessionCount})`,
              description: `Personalized 1:1 Pilates Instruction`,
            },
            unit_amount: unitPrice * 100, 
          },
          quantity: sessionCount,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin') || 'https://www.{{CLIENT_DOMAIN}}'}?one_on_one_success=true&oo_session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}&quantity=${sessionCount}`,
      cancel_url: `${req.headers.get('origin') || 'https://www.{{CLIENT_DOMAIN}}'}?one_on_one_cancel=true`,
      metadata: {
        type: 'one_on_one',
        quantity: sessionCount,
        goal_summary: goalSummary,
        customer_name: name,
        customer_email: email
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
