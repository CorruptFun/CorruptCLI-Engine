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

    // 1. Fetch Class & Check Capacity
    const { data: classData, error: classError } = await supabaseAdmin
      .from('class_availability')
      .select('*')
      .eq('id', classId)
      .single();

    if (classError || !classData) {
      throw new Error("Class not found");
    }

    if (classData.booked_count >= classData.capacity) {
        throw new Error("This class is now full. Please select another time.");
    }

    // 2. Insert Pending Booking
    let { data: booking, error: bookingError } = await supabaseAdmin
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
        // Check if the existing booking is a stale pending one from a cancelled checkout
        const { data: existingBooking } = await supabaseAdmin
          .from('bookings')
          .select('id, payment_status')
          .eq('class_id', classId)
          .eq('guest_email', email)
          .single();

        if (existingBooking?.payment_status === 'pending') {
          // Delete the stale pending booking and retry
          await supabaseAdmin.from('bookings').delete().eq('id', existingBooking.id);
          
          const { data: retryBooking, error: retryError } = await supabaseAdmin
            .from('bookings')
            .insert([{ 
              class_id: classId, 
              user_id: userId,
              guest_name: name,
              guest_email: email,
              payment_method: 'stripe',
              payment_status: 'pending'
            }])
            .select()
            .single();

          if (retryError) throw retryError;
          // Use the retried booking going forward
          booking = retryBooking;
        } else {
          throw new Error("You have already booked this class.");
        }
      } else {
        throw bookingError;
      }
    }

    // --- DATA CAPTURE ---
    // Ensure they are in the customers table, but don't overwrite existing membership
    const { data: existingCust } = await supabaseAdmin
      .from('customers')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (!existingCust) {
      await supabaseAdmin
        .from('customers')
        .insert({ email, name, membership_type: 'Waitlist' });
    }
    // --- END DATA CAPTURE ---

    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Apple pay/Google pay automatically enabled on Stripe dashboard
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `{{CLIENT_NAME}} Class: ${classData.title}`,
              description: `Instructor: ${classData.instructor_name} | Date: ${new Date(classData.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
            },
            unit_amount: Math.round(classData.price * 100), // convert dollars to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin') || 'https://www.{{CLIENT_DOMAIN}}'}?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.id}&class_id=${classId}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
      cancel_url: `${req.headers.get('origin') || 'https://www.{{CLIENT_DOMAIN}}'}?cancel=true&booking_id=${booking.id}&email=${encodeURIComponent(email)}`,
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