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
    const { classId, name, email, userId } = await req.json();

    if (!classId || !name || !email) {
      throw new Error("Missing required fields");
    }

    // Initialize Supabase admin client to fetch class details and insert booking
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch Class
    const { data: classData, error: classError } = await supabaseAdmin
      .from('classes')
      .select('*')
      .eq('id', classId)
      .single();

    if (classError || !classData) {
      throw new Error("Class not found");
    }

    // 2. Insert Pending Booking
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert([
        { 
            class_id: classId, 
            user_id: userId,
            guest_name: name,
            guest_email: email,
            payment_method: 'stripe',
            payment_status: 'pending'
        }
      ])
      .select()
      .single();

    if (bookingError) {
      if(bookingError.code === '23505') {
        throw new Error("You have already booked this class.");
      }
      throw bookingError;
    }

    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Apple pay/Google pay automatically enabled on Stripe dashboard
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `SaaS Boilerplate Class: ${classData.title}`,
              description: `Instructor: ${classData.instructor_name} | Date: ${new Date(classData.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
            },
            unit_amount: Math.round(classData.price * 100), // convert dollars to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${req.headers.get('origin') || 'https://www.yourdomain.com'}?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.id}&class_id=${classId}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
      cancel_url: `${req.headers.get('origin') || 'https://www.yourdomain.com'}?cancel=true&booking_id=${booking.id}`,
      metadata: {
        booking_id: booking.id,
        class_id: classId,
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