-- The table requires anonymous access since users are not signed in yet when creating a profile.
-- We must make sure RLS allows BOTH unauthenticated (anon) and authenticated users to insert.
CREATE POLICY "Anon can insert customers" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anon can update customers" ON public.customers FOR UPDATE TO anon, authenticated USING (true);
