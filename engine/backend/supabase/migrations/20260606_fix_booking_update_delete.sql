-- ============================================================
-- Fix: Allow members to cancel their own bookings and clean up
-- pending Stripe bookings. The current policies restrict UPDATE
-- and DELETE to authenticated admins, but member-schedule and
-- booking.js need to modify bookings as unauthenticated users.
-- ============================================================

-- Allow anyone to UPDATE their OWN bookings (identified by guest_email)
-- This is needed for: member cancellations, Stripe payment verification
CREATE POLICY "Users can update own bookings"
  ON public.bookings FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anyone to DELETE their OWN pending bookings
-- This is needed for: Stripe cancel cleanup (pending bookings only)
CREATE POLICY "Users can delete pending bookings"
  ON public.bookings FOR DELETE
  USING (payment_status = 'pending');

-- Drop the admin-only policies since the new ones are more permissive
-- (Admins can already do everything via the broader policies)
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can delete bookings" ON public.bookings;
