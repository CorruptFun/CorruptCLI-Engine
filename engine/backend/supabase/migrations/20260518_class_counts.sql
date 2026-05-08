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
