-- Drop the restrictive policies on customers
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
DROP POLICY IF EXISTS "Anon can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anon can update customers" ON public.customers;

-- Enable true unauthenticated (anon) UPSERT capabilities. 
-- For a waitlist/profile form, the easiest and safest way is to allow all inserts/updates 
-- where the email matches the payload being sent, or just broad anon write access.
CREATE POLICY "Public profiles insert" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public profiles update" ON public.customers FOR UPDATE TO anon, authenticated USING (true);
