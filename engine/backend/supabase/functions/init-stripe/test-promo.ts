import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'npm:stripe@14.18.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  try {
    // 1. Create Coupon for $1 Test
    const couponTest = await stripe.coupons.create({
      id: 'coupon_TEST_1_Dollar_v1',
      amount_off: 2900, // Assuming a $30 drop-in, take off $29 to leave $1.
      currency: 'usd',
      duration: 'once',
      name: 'Test Dollar Promo',
    });

    // 2. Create Promo Code for Dollar
    const promoTest = await stripe.promotionCodes.create({
      coupon: couponTest.id,
      code: 'DOLLAR',
      max_redemptions: 1,
    });

    return new Response(JSON.stringify({
      success: true,
      promoTest
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
