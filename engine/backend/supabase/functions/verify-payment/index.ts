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
    const { session_id, booking_id } = await req.json();

    if (!session_id || !booking_id) {
      throw new Error("Missing required parameters");
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Validate that the booking_id matches what Stripe has in metadata
      const metaBookingId = session.metadata?.booking_id;
      if (metaBookingId && metaBookingId !== booking_id) {
        throw new Error("Booking ID does not match payment session.");
      }

      // Idempotency: check if already processed
      const { data: existing } = await supabaseAdmin
        .from('bookings')
        .select('payment_status')
        .eq('id', booking_id)
        .maybeSingle();

      if (existing?.payment_status === 'paid') {
        return new Response(JSON.stringify({ status: 'success', message: 'Already processed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const { error } = await supabaseAdmin
        .from('bookings')
        .update({ payment_status: 'paid' })
        .eq('id', booking_id);

      if (error) throw error;

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