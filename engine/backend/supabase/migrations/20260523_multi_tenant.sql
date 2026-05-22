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
VALUES ('df0e6a12-867c-4749-b2aa-1b2302db6185', '{{CLIENT_NAME}} Pilates', 'reformher')
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
