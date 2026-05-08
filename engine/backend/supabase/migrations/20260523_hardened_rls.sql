-- 20260523_hardened_rls.sql
-- Implement database-level multi-tenancy enforcement (RLS)

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
-- This function runs on login to inject org_id and role into the JWT
CREATE OR REPLACE FUNCTION public.handle_auth_login()
RETURNS trigger AS $$
DECLARE
  role_data record;
BEGIN
  -- Look up the user's role and org
  SELECT role, org_id INTO role_data FROM public.user_roles WHERE user_id = NEW.id LIMIT 1;
  
  -- If found, inject into app_metadata
  IF FOUND THEN
    NEW.raw_app_metadata = NEW.raw_app_metadata || 
      jsonb_build_object('org_id', role_data.org_id, 'role', role_data.role);
  END IF;
  
  -- Special Case: Always make YOUR_SUPER_ADMIN_EMAIL a super_admin if they exist
  IF NEW.email = 'YOUR_SUPER_ADMIN_EMAIL' THEN
    NEW.raw_app_metadata = NEW.raw_app_metadata || 
      jsonb_build_object('role', 'super_admin');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auth.users
DROP TRIGGER IF EXISTS tr_auth_login ON auth.users;
CREATE TRIGGER tr_auth_login
BEFORE UPDATE ON auth.users
FOR EACH ROW
WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
EXECUTE FUNCTION public.handle_auth_login();

-- 3. Hardened RLS Policies

-- Helper function to check if user is a super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin';
$$ LANGUAGE sql STABLE;

-- Helper function to get current org_id from JWT
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Apply to Events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.events;
CREATE POLICY "Tenant Isolation" ON public.events
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
