import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'npm:stripe@14.18.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  try {
    // 1. Create Coupon for 1-Month ($260 off to make total $200)
    let coupon1M;
    try {
      coupon1M = await stripe.coupons.retrieve('coupon_1M_First5_v2');
    } catch {
      coupon1M = await stripe.coupons.create({
        id: 'coupon_1M_First5_v2',
        amount_off: 26000,
        currency: 'usd',
        duration: 'once',
        name: 'First 5 - 1 Month Discount ($200 Total)',
      });
    }

    // 2. Create Promo Code for 1-Month
    let promo1M;
    const promo1M_list = await stripe.promotionCodes.list({ code: 'FIRST5-1M', active: true });
    if (promo1M_list.data.length > 0) {
      // If the existing promo uses the old coupon, we should deactivate it and create a new one
      const currentPromo = promo1M_list.data[0];
      if (currentPromo.coupon.id !== coupon1M.id) {
          await stripe.promotionCodes.update(currentPromo.id, { active: false });
          promo1M = await stripe.promotionCodes.create({
            coupon: coupon1M.id,
            code: 'FIRST5-1M',
            max_redemptions: 5,
          });
      } else {
          promo1M = currentPromo;
      }
    } else {
      promo1M = await stripe.promotionCodes.create({
        coupon: coupon1M.id,
        code: 'FIRST5-1M',
        max_redemptions: 5,
      });
    }

    // 3. Create Coupon for 3-Month ($1 off)
    let coupon3M;
    try {
      coupon3M = await stripe.coupons.retrieve('coupon_3M_First5_v1');
    } catch {
      coupon3M = await stripe.coupons.create({
        id: 'coupon_3M_First5_v1',
        amount_off: 100, // $1 off
        currency: 'usd',
        duration: 'once',
        name: 'First 5 - 3 Month Bonus',
      });
    }

    // 4. Create Promo Code for 3-Month
    let promo3M;
    const promo3M_list = await stripe.promotionCodes.list({ code: 'FIRST5-3M' });
    if (promo3M_list.data.length > 0) {
      promo3M = promo3M_list.data[0];
    } else {
      promo3M = await stripe.promotionCodes.create({
        coupon: coupon3M.id,
        code: 'FIRST5-3M',
        max_redemptions: 5,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      promo1M,
      promo3M
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
