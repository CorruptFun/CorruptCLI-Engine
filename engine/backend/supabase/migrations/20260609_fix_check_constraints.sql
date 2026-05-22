-- ============================================================
-- Fix: Update CHECK constraints on bookings table
-- The original constraints from 20260503 and 20260505 are too
-- restrictive and don't include values used by the current system.
-- ============================================================

-- Drop old restrictive status constraint and add updated one
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check 
    CHECK (status IN ('confirmed', 'cancelled', 'waitlisted', 'no_show'));

-- Drop old restrictive payment_method constraint and add updated one  
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_method_check 
    CHECK (payment_method IN ('cash', 'stripe', 'membership', 'credits'));
