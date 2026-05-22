import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, email, booking_id } = payload;

    if (!email || !type) {
      throw new Error("Missing required fields: type, email");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const sanitizedEmail = email.trim().toLowerCase();

    switch (type) {

      // ─── BOOKING ELIGIBILITY ───────────────────────────────────
      // Used by booking.js on email blur: determines payment options,
      // checks credit balance/expiration, past-due status, waiver status
      case 'booking_eligibility': {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('class_credits, membership_type, membership_expires_at, credits_expires_at, waiver_signed_at, name')
          .eq('email', sanitizedEmail)
          .maybeSingle();

        // Count unpaid cash bookings (past-due balance check)
        let unpaid_count = 0;
        if (customer) {
          const { data: unpaidBookings } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('guest_email', sanitizedEmail)
            .eq('payment_method', 'cash')
            .eq('payment_status', 'pending')
            .eq('status', 'confirmed');
          unpaid_count = unpaidBookings?.length || 0;
        }

        return respond({
          found: !!customer,
          class_credits: customer?.class_credits ?? 0,
          membership_type: customer?.membership_type ?? null,
          membership_expires_at: customer?.membership_expires_at ?? null,
          credits_expires_at: customer?.credits_expires_at ?? null,
          waiver_signed_at: customer?.waiver_signed_at ?? null,
          name: customer?.name ?? null,
          unpaid_count
        });
      }

      // ─── MEMBER PROFILE ────────────────────────────────────────
      // Used by member-schedule.js on init: loads membership data for scheduling
      case 'member_profile': {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('name, email, membership_type, class_credits, membership_expires_at, credits_expires_at, waiver_signed_at')
          .eq('email', sanitizedEmail)
          .maybeSingle();

        if (!customer) {
          return respond({ found: false }, 404);
        }

        return respond({
          found: true,
          ...customer
        });
      }

      // ─── MEMBER BOOKINGS ───────────────────────────────────────
      // Used by member-schedule.js to show upcoming schedule + cancel buttons
      case 'member_bookings': {
        const { data: bookings, error } = await supabaseAdmin
          .from('bookings')
          .select(`
            id,
            status,
            class_id,
            classes (
              title,
              start_time,
              instructor_name
            )
          `)
          .eq('guest_email', sanitizedEmail)
          .eq('status', 'confirmed');

        if (error) throw error;

        return respond({ bookings: bookings || [] });
      }

      // ─── MEMBER CREDITS ────────────────────────────────────────
      // Used by member-schedule.js after a cancellation to refresh credit count
      case 'member_credits': {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('class_credits')
          .eq('email', sanitizedEmail)
          .maybeSingle();

        return respond({ class_credits: customer?.class_credits ?? 0 });
      }

      // ─── WAIVER PREFILL ────────────────────────────────────────
      // Used by waiver.js to pre-populate the waiver form with existing data
      case 'waiver_prefill': {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('name, phone, address, emergency_contact_name, emergency_contact_phone, secondary_email, date_of_birth, fitness_goals, waiver_signed_at, waiver_photo_release, waiver_minor_guardian_name')
          .eq('email', sanitizedEmail)
          .maybeSingle();

        return respond({
          found: !!customer,
          ...(customer || {})
        });
      }

      // ─── CANCEL BOOKING ───────────────────────────────────────
      // Used by member-schedule.js to cancel a booking via service_role
      // (RLS blocks direct UPDATE from anon/non-admin users)
      case 'cancel_booking': {
        if (!booking_id) throw new Error('Missing booking_id');

        // Verify this booking belongs to this email (ownership check)
        const { data: bookingRow } = await supabaseAdmin
          .from('bookings')
          .select('id, guest_email, status, payment_status, class_id')
          .eq('id', booking_id)
          .maybeSingle();

        if (!bookingRow) throw new Error('Booking not found');
        if (bookingRow.guest_email?.toLowerCase() !== sanitizedEmail) {
          throw new Error('You can only cancel your own bookings');
        }
        if (bookingRow.status === 'cancelled') {
          return respond({ success: true, message: 'Already cancelled' });
        }

        // Check 24-hour rule — only for confirmed/paid bookings
        // Pending bookings (abandoned Stripe checkout) should always be cleanable
        if (bookingRow.status !== 'pending' && bookingRow.payment_status !== 'pending') {
          const { data: classRow } = await supabaseAdmin
            .from('classes')
            .select('start_time')
            .eq('id', bookingRow.class_id)
            .maybeSingle();

          if (classRow) {
            const hoursUntil = (new Date(classRow.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
            if (hoursUntil < 24) {
              throw new Error('Cannot cancel within 24 hours of class. Contact {{ADMIN_EMAIL}}');
            }
          }
        }

        const { error: cancelErr } = await supabaseAdmin
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', booking_id);

        if (cancelErr) throw cancelErr;

        return respond({ success: true });
      }

      // ─── SAVE WAIVER ─────────────────────────────────────────
      // Used by waiver.js to save waiver data via service_role
      // (RLS blocks anon UPDATE because anon can't SELECT to match the row)
      case 'save_waiver': {
        if (!payload.waiver_data) throw new Error('Missing waiver_data');

        const { data: existingCustomer } = await supabaseAdmin
          .from('customers')
          .select('email')
          .eq('email', sanitizedEmail)
          .maybeSingle();

        if (existingCustomer) {
          const { error: updateErr } = await supabaseAdmin
            .from('customers')
            .update(payload.waiver_data)
            .eq('email', sanitizedEmail);
          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabaseAdmin
            .from('customers')
            .insert({ email: sanitizedEmail, ...payload.waiver_data, membership_type: 'A La Carte' });
          if (insertErr) throw insertErr;
        }

        return respond({ success: true });
      }

      // ─── SAVE PROFILE ─────────────────────────────────────────
      // Used by booking.js profile form to save customer profile via service_role
      case 'save_profile': {
        const { data: existingProfile } = await supabaseAdmin
          .from('customers')
          .select('email')
          .eq('email', sanitizedEmail)
          .maybeSingle();

        if (existingProfile) {
          const { error: updateErr } = await supabaseAdmin
            .from('customers')
            .update(payload.profile_data)
            .eq('email', sanitizedEmail);
          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabaseAdmin
            .from('customers')
            .insert({ email: sanitizedEmail, ...payload.profile_data, membership_type: 'Waitlist' });
          if (insertErr) throw insertErr;
        }

        return respond({ success: true });
      }

      // ─── ADMIN LIST CUSTOMERS ─────────────────────────────────
      // Diagnostic: lists all customers with membership data + bookings + classes
      case 'admin_list_customers': {
        const [custResult, bookResult, classResult] = await Promise.all([
          supabaseAdmin.from('customers')
            .select('name, email, membership_type, class_credits, membership_expires_at, credits_expires_at, one_on_one_credits, waiver_signed_at')
            .order('name', { ascending: true }),
          supabaseAdmin.from('bookings')
            .select('id, class_id, guest_name, guest_email, payment_method, payment_status, status, created_at'),
          supabaseAdmin.from('classes')
            .select('id, title, start_time, status, max_capacity')
            .gte('start_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('start_time', { ascending: true })
        ]);

        if (custResult.error) throw custResult.error;
        return respond({
          customers: custResult.data || [],
          bookings: bookResult.data || [],
          classes: classResult.data || []
        });
      }

      // ─── FIX MEMBER BOOKINGS ─────────────────────────────────
      // Corrects pending cash bookings for unlimited members to membership/paid
      case 'fix_member_bookings': {
        // Find pending cash bookings for this email
        const { data: pendingBookings, error: pbErr } = await supabaseAdmin
          .from('bookings')
          .select('id, class_id, payment_method, payment_status, status')
          .eq('guest_email', sanitizedEmail)
          .eq('payment_method', 'cash')
          .eq('payment_status', 'pending')
          .eq('status', 'confirmed');

        if (pbErr) throw pbErr;

        if (!pendingBookings || pendingBookings.length === 0) {
          return respond({ success: true, message: 'No pending cash bookings found', fixed: 0 });
        }

        // Update them to membership/paid
        const ids = pendingBookings.map((b: any) => b.id);
        const { error: fixErr } = await supabaseAdmin
          .from('bookings')
          .update({ payment_method: 'membership', payment_status: 'paid' })
          .in('id', ids);

        if (fixErr) throw fixErr;

        return respond({ success: true, fixed: ids.length, booking_ids: ids });
      }

      default:
        throw new Error(`Unknown lookup type: ${type}`);
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: {
      ...{
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
      'Content-Type': 'application/json'
    },
    status,
  });
}
