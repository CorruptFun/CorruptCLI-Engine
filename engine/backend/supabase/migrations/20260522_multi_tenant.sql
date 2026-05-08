-- 20260522_multi_tenant.sql
-- Add organization support for Multi-Tenant Mode

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add org_id to existing tables
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Update RLS for Multi-Tenancy
-- Note: These policies assume the application passes the org_id as a header or filters strictly in the query.
-- For a truly secure multi-tenant setup, we would use custom JWT claims or a lookup table for admin users.

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Admins can view their own organization
CREATE POLICY "Admins can view own organization" 
    ON public.organizations FOR SELECT 
    USING (true); -- Simplified for boilerplate, adjust as needed for private configs

-- Example: Strict RLS update for Events
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
CREATE POLICY "Events are viewable by everyone" ON public.events 
    FOR SELECT USING (true); -- Public view still allowed

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events(org_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org_id ON public.bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_subs_org_id ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id);
