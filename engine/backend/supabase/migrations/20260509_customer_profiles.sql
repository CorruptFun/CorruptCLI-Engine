ALTER TABLE public.customers ADD COLUMN address TEXT;
ALTER TABLE public.customers ADD COLUMN phone TEXT;
ALTER TABLE public.customers ADD COLUMN sex TEXT;

-- Allow anonymous users to insert into customers table for waitlist/profile creation
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT WITH CHECK (true);
