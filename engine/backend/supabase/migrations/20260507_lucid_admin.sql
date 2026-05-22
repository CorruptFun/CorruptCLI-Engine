-- Drop old policies to replace them with the expanded list
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can delete all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can update classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can delete classes" ON public.classes;

-- Allow both admin emails to manage bookings
CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT USING ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );
CREATE POLICY "Admins can update all bookings" ON public.bookings FOR UPDATE USING ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );
CREATE POLICY "Admins can delete all bookings" ON public.bookings FOR DELETE USING ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );

-- Allow both admin emails to manage classes
CREATE POLICY "Admins can insert classes" ON public.classes FOR INSERT WITH CHECK ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );
CREATE POLICY "Admins can update classes" ON public.classes FOR UPDATE USING ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );
CREATE POLICY "Admins can delete classes" ON public.classes FOR DELETE USING ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );
