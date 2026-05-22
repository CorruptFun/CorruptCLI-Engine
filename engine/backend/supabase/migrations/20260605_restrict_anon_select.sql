-- ============================================================
-- Restrict anonymous SELECT access to customers and bookings tables
-- DEPLOY AFTER customer-lookup Edge Function is live and all
-- client-side JS files have been updated to use it.
-- ============================================================

-- 1. Lock down customer SELECT — remove public read access
DROP POLICY IF EXISTS "Anyone can read customers" ON public.customers;

-- Only authenticated admins can SELECT directly (for admin dashboard)
CREATE POLICY "Admins can read all customers"
  ON public.customers FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));

-- Note: INSERT and UPDATE policies for signups/waivers remain unchanged
-- Note: Edge Functions use service_role key which bypasses RLS entirely

-- 2. Lock down booking SELECT — remove public read access
DROP POLICY IF EXISTS "Anyone can read bookings" ON public.bookings;

-- Only authenticated admins can SELECT bookings directly
CREATE POLICY "Admins can read all bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));

-- Note: INSERT policies for guest bookings remain unchanged
-- Note: The class_availability view is used by the public calendar and 
-- only exposes class data (not customer/booking PII)
