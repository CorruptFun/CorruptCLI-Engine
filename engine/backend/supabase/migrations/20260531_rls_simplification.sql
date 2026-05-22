-- ============================================================
-- {{CLIENT_NAME}} RLS Simplification
-- Removes the need for signInAnonymously() on all frontend forms
-- ============================================================

-- ===========================================
-- CUSTOMERS TABLE
-- Goal: Anyone can create/update a customer record (public signup forms, waivers)
--       Admins can do everything
--       SELECT is open (needed for email-based lookups)
-- ===========================================

-- Drop ALL existing customer policies to start clean
DROP POLICY IF EXISTS "Admin All Access" ON public.customers;
DROP POLICY IF EXISTS "Admins manage all customers" ON public.customers;
DROP POLICY IF EXISTS "Allow public signups" ON public.customers;
DROP POLICY IF EXISTS "Allow waiver updates" ON public.customers;
DROP POLICY IF EXISTS "Anon can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anon can update customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
DROP POLICY IF EXISTS "Public Insert" ON public.customers;
DROP POLICY IF EXISTS "Public Select" ON public.customers;
DROP POLICY IF EXISTS "Public Update" ON public.customers;
DROP POLICY IF EXISTS "Public profiles insert" ON public.customers;
DROP POLICY IF EXISTS "Public profiles update" ON public.customers;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.customers;
DROP POLICY IF EXISTS "Users update profile" ON public.customers;
DROP POLICY IF EXISTS "Users view profile" ON public.customers;

-- New clean policies (4 total)
CREATE POLICY "Anyone can read customers"
  ON public.customers FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create customers"
  ON public.customers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update customers"
  ON public.customers FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete customers"
  ON public.customers FOR DELETE TO authenticated
  USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));


-- ===========================================
-- BOOKINGS TABLE
-- Goal: Anyone can create a booking (insert)
--       Anyone can read bookings (needed for duplicate checking)
--       Admins can update/delete (cancel, mark paid)
--       The database triggers handle credit deduction/refund
-- ===========================================

-- Drop ALL existing booking policies
DROP POLICY IF EXISTS "Admins can delete all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins manage all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Allow guest bookings" ON public.bookings;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.bookings;
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users manage own bookings" ON public.bookings;

-- New clean policies (4 total)
CREATE POLICY "Anyone can read bookings"
  ON public.bookings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));

CREATE POLICY "Admins can delete bookings"
  ON public.bookings FOR DELETE TO authenticated
  USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));

-- ===========================================
-- Make user_id nullable on bookings
-- We identify customers by guest_email, not auth ID
-- ===========================================
ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN user_id SET DEFAULT NULL;

-- ===========================================
-- Revoke EXECUTE on credit functions from anon
-- These should only be callable by authenticated or service_role
-- (Edge functions use service_role key)
-- ===========================================
REVOKE EXECUTE ON FUNCTION public.deduct_credit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_one_on_one_credit(text, integer) FROM anon;
