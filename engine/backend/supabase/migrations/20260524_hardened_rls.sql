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
