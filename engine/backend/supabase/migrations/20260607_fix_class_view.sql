-- ============================================================
-- Fix: Rebuild class_availability view to include is_private
-- The column was added to classes in 20260526 but the view was
-- last rebuilt in 20260523, so it's missing. booking.js filters
-- on is_private=false and this would fail/show wrong results.
-- ============================================================

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
    c.is_private,
    COALESCE(COUNT(b.id), 0) AS booked_count
FROM public.classes c
LEFT JOIN public.bookings b ON c.id = b.class_id AND b.status != 'cancelled'
GROUP BY c.id;

GRANT SELECT ON public.class_availability TO anon, authenticated;
