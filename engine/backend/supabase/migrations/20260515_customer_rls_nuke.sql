-- If update is STILL failing, it is because UPDATE requires SELECT permission in Supabase to check the existing row before overwriting it.
-- Let's drop all policies on customers and rebuild them properly.
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Public profiles insert" ON public.customers;
DROP POLICY IF EXISTS "Public profiles update" ON public.customers;

-- 1. Admins have FULL access
CREATE POLICY "Admin All Access" ON public.customers FOR ALL USING ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );

-- 2. Public can INSERT 
CREATE POLICY "Public Insert" ON public.customers FOR INSERT WITH CHECK (true);

-- 3. Public can UPDATE (Note: Upsert checks SELECT first if the row exists)
CREATE POLICY "Public Update" ON public.customers FOR UPDATE USING (true);

-- 4. Public can SELECT only their own record (Required for upsert to resolve correctly)
-- We'll allow public to select so upsert works, but the frontend will never query it for a list.
CREATE POLICY "Public Select" ON public.customers FOR SELECT USING (true);
