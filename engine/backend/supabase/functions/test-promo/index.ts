import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'npm:stripe@14.18.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  try {
    // 1. Deactivate any existing DOLLAR codes
    const existingPromos = await stripe.promotionCodes.list({ code: 'DOLLAR', active: true });
    for (const promo of existingPromos.data) {
        await stripe.promotionCodes.update(promo.id, { active: false });
    }

    // 2. Delete the coupons associated with the test if possible (Stripe allows deleting coupons)
    try {
        await stripe.coupons.del('coupon_TEST_1_Dollar_v1');
    } catch (e) {} // Ignore if it doesn't exist
    try {
        await stripe.coupons.del('coupon_TEST_1_Dollar_v2');
    } catch (e) {}

    return new Response(JSON.stringify({
      success: true,
      message: "Test promotion codes and coupons have been completely deleted/deactivated."
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
