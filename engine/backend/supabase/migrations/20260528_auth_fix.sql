-- Emergency Patch for Auth Metadata Trigger
-- This removes the custom trigger that is likely causing the "Database error granting user" during login.

DROP TRIGGER IF EXISTS tr_auth_login ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auth_login();

-- Revert RLS policies to the standard Admin checks while we debug the trigger
DROP POLICY IF EXISTS "Tenant Isolation" ON public.classes;
CREATE POLICY "Tenant Isolation" ON public.classes
FOR ALL TO authenticated
USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));

DROP POLICY IF EXISTS "Tenant Isolation" ON public.bookings;
CREATE POLICY "Tenant Isolation" ON public.bookings
FOR ALL TO authenticated
USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));

DROP POLICY IF EXISTS "Tenant Isolation" ON public.subscriptions;
CREATE POLICY "Tenant Isolation" ON public.subscriptions
FOR ALL TO authenticated
USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));

DROP POLICY IF EXISTS "Tenant Isolation" ON public.customers;
CREATE POLICY "Tenant Isolation" ON public.customers
FOR ALL TO authenticated
USING (auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}'));
