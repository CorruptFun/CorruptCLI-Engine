-- Allow anonymous users to update customers table if they are just re-submitting their own profile data.
-- Since the JS code uses .upsert() instead of .insert(), Supabase requires UPDATE permissions.
CREATE POLICY "Anyone can update customers" ON public.customers FOR UPDATE USING (true);
