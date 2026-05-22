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
