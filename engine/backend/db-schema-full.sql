-- Create classes table
CREATE TABLE public.classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    capacity INT NOT NULL DEFAULT 12,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    instructor_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bookings table
CREATE TABLE public.bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'waitlisted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(class_id, user_id)
);

-- Setup RLS (Row Level Security)
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Classes are viewable by everyone
CREATE POLICY "Classes are viewable by everyone" ON public.classes FOR SELECT USING (true);

-- Users can view their own bookings
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own bookings
CREATE POLICY "Users can insert own bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update (cancel) their own bookings
CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE USING (auth.uid() = user_id);
ALTER TABLE public.bookings ADD COLUMN guest_name TEXT;
ALTER TABLE public.bookings ADD COLUMN guest_email TEXT;
-- Add price to classes (Defaulting to the $30 Group Class rate)
ALTER TABLE public.classes ADD COLUMN price NUMERIC(10, 2) DEFAULT 30.00;

-- Track payment intent and status on bookings
ALTER TABLE public.bookings ADD COLUMN payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'stripe'));
ALTER TABLE public.bookings ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid'));

-- Note: If website pricing changes, update the price column in the classes table 
-- so Stripe processes the correct amount.
-- Allow the admin email to view and modify all bookings
CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can update all bookings" ON public.bookings FOR UPDATE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can delete all bookings" ON public.bookings FOR DELETE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );

-- Allow the admin email to manage classes
CREATE POLICY "Admins can insert classes" ON public.classes FOR INSERT WITH CHECK ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can update classes" ON public.classes FOR UPDATE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
CREATE POLICY "Admins can delete classes" ON public.classes FOR DELETE USING ( auth.jwt() ->> 'email' = '{{ADMIN_EMAIL}}' );
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
ALTER TABLE public.customers ADD COLUMN address TEXT;
ALTER TABLE public.customers ADD COLUMN phone TEXT;
ALTER TABLE public.customers ADD COLUMN sex TEXT;

-- Allow anonymous users to insert into customers table for waitlist/profile creation
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT WITH CHECK (true);
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
-- Allow anonymous users to update customers table if they are just re-submitting their own profile data.
-- Since the JS code uses .upsert() instead of .insert(), Supabase requires UPDATE permissions.
CREATE POLICY "Anyone can update customers" ON public.customers FOR UPDATE USING (true);
-- The table requires anonymous access since users are not signed in yet when creating a profile.
-- We must make sure RLS allows BOTH unauthenticated (anon) and authenticated users to insert.
CREATE POLICY "Anon can insert customers" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anon can update customers" ON public.customers FOR UPDATE TO anon, authenticated USING (true);
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
-- 20260516_billing_subscriptions.sql
CREATE TABLE public.subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    plan_interval TEXT NOT NULL, -- e.g., '1-month', '3-month'
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL, -- 'active', 'canceled', 'past_due', 'unpaid'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscriptions
CREATE POLICY "Users can view own subscriptions" 
    ON public.subscriptions FOR SELECT 
    USING (auth.uid() = user_id);

-- Performance Indexes
CREATE INDEX idx_subs_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subs_stripe_sub_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_subs_period_end ON public.subscriptions(current_period_end);
-- Add tracking for the "First 5" 3-month promo
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS first5_3m_claimed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS first5_3m_used integer DEFAULT 0;
CREATE OR REPLACE VIEW public.class_availability WITH (security_invoker = false) AS
SELECT 
    c.id,
    c.title,
    c.description,
    c.capacity,
    c.start_time,
    c.end_time,
    c.instructor_name,
    c.price,
    COALESCE(COUNT(b.id), 0) AS booked_count
FROM public.classes c
LEFT JOIN public.bookings b ON c.id = b.class_id AND b.status != 'cancelled'
GROUP BY c.id;

GRANT SELECT ON public.class_availability TO anon, authenticated;
-- Update default capacity for classes table
ALTER TABLE public.classes ALTER COLUMN capacity SET DEFAULT 6;

-- Update existing classes to 6
UPDATE public.classes SET capacity = 6;
-- Add tracking for waivers, emergency contacts, and missing data to the customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS fitness_goals TEXT,
ADD COLUMN IF NOT EXISTS waiver_signed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS waiver_legal_name TEXT,
ADD COLUMN IF NOT EXISTS waiver_ip_address TEXT,
ADD COLUMN IF NOT EXISTS waiver_photo_release BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS waiver_minor_guardian_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS secondary_email text;
-- Function to verify class capacity before booking
CREATE OR REPLACE FUNCTION check_class_capacity()
RETURNS TRIGGER AS $$
DECLARE
    current_count INT;
    max_capacity INT;
BEGIN
    -- Get current confirmed bookings count for this class
    SELECT booked_count, capacity INTO current_count, max_capacity
    FROM class_availability
    WHERE id = NEW.class_id;

    -- If the class is full, abort the insert
    IF current_count >= max_capacity THEN
        RAISE EXCEPTION 'This class is already at full capacity (%)', max_capacity;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run before each booking insert
DROP TRIGGER IF EXISTS tr_check_capacity ON bookings;
CREATE TRIGGER tr_check_capacity
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION check_class_capacity();
-- 20260523_multi_tenant.sql
-- Add organization support for Multi-Tenant Mode

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert {{CLIENT_NAME}} as the primary organization
INSERT INTO public.organizations (id, name, slug) 
VALUES ('df0e6a12-867c-4749-b2aa-1b2302db6185', '{{CLIENT_NAME}}', 'reformher')
ON CONFLICT (slug) DO NOTHING;

-- Add org_id to existing tables with default pointing to {{CLIENT_NAME}}
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT 'df0e6a12-867c-4749-b2aa-1b2302db6185';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT 'df0e6a12-867c-4749-b2aa-1b2302db6185';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT 'df0e6a12-867c-4749-b2aa-1b2302db6185';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT 'df0e6a12-867c-4749-b2aa-1b2302db6185';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_classes_org_id ON public.classes(org_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org_id ON public.bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_subs_org_id ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(org_id);

-- Update class_availability view to include org_id
DROP VIEW IF EXISTS public.class_availability;
CREATE OR REPLACE VIEW public.class_availability WITH (security_invoker = false) AS
SELECT 
    c.id,
    c.title,
    c.description,
    c.capacity,
    c.start_time,
    c.end_time,
    c.instructor_name,
    c.price,
    c.org_id,
    COALESCE(COUNT(b.id), 0) AS booked_count
FROM public.classes c
LEFT JOIN public.bookings b ON c.id = b.class_id AND b.status != 'cancelled'
GROUP BY c.id;
-- 20260524_hardened_rls.sql
-- Implement database-level multi-tenancy enforcement (RLS) for {{CLIENT_NAME}}

-- 1. Identity Infrastructure
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'super_admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, org_id)
);

-- 2. JWT Custom Claims Logic
CREATE OR REPLACE FUNCTION public.handle_auth_login()
RETURNS trigger AS $$
DECLARE
  role_data record;
BEGIN
  SELECT role, org_id INTO role_data FROM public.user_roles WHERE user_id = NEW.id LIMIT 1;
  
  IF FOUND THEN
    NEW.raw_app_metadata = NEW.raw_app_metadata || 
      jsonb_build_object('org_id', role_data.org_id, 'role', role_data.role);
  END IF;
  
  -- Global Super Admin Override
  IF NEW.email = '{{DEV_EMAIL}}' THEN
    NEW.raw_app_metadata = NEW.raw_app_metadata || 
      jsonb_build_object('role', 'super_admin');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_auth_login ON auth.users;
CREATE TRIGGER tr_auth_login
BEFORE UPDATE ON auth.users
FOR EACH ROW
WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
EXECUTE FUNCTION public.handle_auth_login();

-- 3. Hardened RLS Policies

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Apply to Classes
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.classes;
CREATE POLICY "Tenant Isolation" ON public.classes
FOR ALL TO authenticated
USING (is_super_admin() OR org_id = current_org_id());

-- Apply to Bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.bookings;
CREATE POLICY "Tenant Isolation" ON public.bookings
FOR ALL TO authenticated
USING (is_super_admin() OR org_id = current_org_id());

-- Apply to Subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.subscriptions;
CREATE POLICY "Tenant Isolation" ON public.subscriptions
FOR ALL TO authenticated
USING (is_super_admin() OR org_id = current_org_id());

-- Apply to Customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.customers;
CREATE POLICY "Tenant Isolation" ON public.customers
FOR ALL TO authenticated
USING (is_super_admin() OR org_id = current_org_id());

-- 4. Initial Provisioning
-- Link {{CLIENT_NAME}} admin to the Org
INSERT INTO public.user_roles (user_id, org_id, role)
SELECT id, 'df0e6a12-867c-4749-b2aa-1b2302db6185', 'admin'
FROM auth.users 
WHERE email = '{{ADMIN_EMAIL}}'
ON CONFLICT DO NOTHING;
-- 20260525_fix_lucid_admin.sql
-- Ensure {{DEV_EMAIL}} has super_admin role and bypasses multi-tenant RLS

-- 1. Insert/Update user role
-- Note: This depends on the user having already signed up/attempted login so they exist in auth.users
INSERT INTO public.user_roles (user_id, org_id, role)
SELECT id, 'df0e6a12-867c-4749-b2aa-1b2302db6185', 'super_admin'
FROM auth.users 
WHERE email = '{{DEV_EMAIL}}'
ON CONFLICT (user_id, org_id) DO UPDATE SET role = 'super_admin';

-- 2. Ensure handle_auth_login trigger correctly handles the super_admin role
CREATE OR REPLACE FUNCTION public.handle_auth_login()
RETURNS trigger AS $$
DECLARE
  role_data record;
BEGIN
  SELECT role, org_id INTO role_data FROM public.user_roles WHERE user_id = NEW.id LIMIT 1;
  
  IF FOUND THEN
    NEW.raw_app_metadata = NEW.raw_app_metadata || 
      jsonb_build_object('org_id', role_data.org_id, 'role', role_data.role);
  END IF;
  
  -- Global Super Admin Override (Hardcoded backup)
  IF NEW.email = '{{DEV_EMAIL}}' THEN
    NEW.raw_app_metadata = NEW.raw_app_metadata || 
      jsonb_build_object('role', 'super_admin');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 20260526_1on1_sessions.sql
-- Add support for Private 1:1 sessions and tracking session credits

-- 1. Update Customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS one_on_one_credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_goal_summary TEXT;

-- 2. Update Classes table
ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS assigned_customer_email TEXT;

-- 3. Function to atomically deduct 1:1 credits
CREATE OR REPLACE FUNCTION deduct_one_on_one_credit(user_email text, amount integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_credits integer;
BEGIN
    SELECT one_on_one_credits INTO current_credits 
    FROM customers 
    WHERE email = user_email;

    IF current_credits IS NULL OR current_credits < amount THEN
        RETURN false;
    END IF;

    UPDATE customers 
    SET one_on_one_credits = one_on_one_credits - amount 
    WHERE email = user_email;

    RETURN true;
END;
$$;
