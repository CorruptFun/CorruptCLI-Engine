CREATE TABLE public.customers (
    email TEXT PRIMARY KEY,
    name TEXT,
    membership_type TEXT DEFAULT 'A La Carte',
    membership_expires_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage customers" ON public.customers 
FOR ALL USING ( auth.jwt() ->> 'email' IN ('{{ADMIN_EMAIL}}', '{{DEV_EMAIL}}') );
