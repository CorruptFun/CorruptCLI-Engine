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
    '6 Class Plan': { amount: 16500, name: '6 Class Plan' },
    '8 Class Plan': { amount: 22500, name: '8 Class Plan' },
    '12 Class Plan': { amount: 34500, name: '12 Class Plan' },
    '1 Month Unlimited': { amount: 46000, name: '1 Month Unlimited' },
    '3 Months Unlimited': { amount: 60000, name: '3 Months Unlimited' }
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

    const plan = PRICING[tier];
    if (!plan) throw new Error("Invalid membership tier");

    // 1. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `SaaS Boilerplate: ${plan.name}`,
              description: `Access to SaaS Boilerplate Service Organization`,
            },
            unit_amount: plan.amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${req.headers.get('origin') || 'https://www.yourdomain.com'}?mem_session_id={CHECKOUT_SESSION_ID}&tier=${encodeURIComponent(tier)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&preferred_time=${encodeURIComponent(preferred_time || '')}`,
      cancel_url: `${req.headers.get('origin') || 'https://www.yourdomain.com'}?mem_cancel=true`,
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
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});