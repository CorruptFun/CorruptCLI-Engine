-- Allow the admin email to view and modify all bookings
CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can update all bookings" ON public.bookings FOR UPDATE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can delete all bookings" ON public.bookings FOR DELETE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );

-- Allow the admin email to manage classes
CREATE POLICY "Admins can insert classes" ON public.classes FOR INSERT WITH CHECK ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can update classes" ON public.classes FOR UPDATE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can delete classes" ON public.classes FOR DELETE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
