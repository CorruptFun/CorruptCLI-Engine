import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'npm:stripe@14.18.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  try {
    const charges = await stripe.charges.list({ limit: 5 });
    const sessions = await stripe.checkout.sessions.list({ limit: 5 });
    const intents = await stripe.paymentIntents.list({ limit: 5 });

    return new Response(JSON.stringify({
      charges: charges.data.map(c => ({ id: c.id, amount: c.amount, status: c.status, paid: c.paid })),
      sessions: sessions.data.map(s => ({ id: s.id, amount_total: s.amount_total, payment_status: s.payment_status })),
      intents: intents.data.map(pi => ({ id: pi.id, amount: pi.amount, status: pi.status, last_error: pi.last_payment_error?.message }))
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
