-- ============================================================
-- Fix: Unique booking constraint blocks rebooking after cancel
-- The current unique index on (class_id, guest_email) prevents
-- a user from rebooking a class they previously cancelled.
-- Fix: Only enforce uniqueness for non-cancelled bookings.
-- ============================================================

-- Drop the old unconditional unique index
DROP INDEX IF EXISTS idx_unique_booking_email;

-- Create a partial unique index that only applies to active bookings
-- This allows rebooking after cancellation while still preventing
-- duplicate active bookings for the same class
CREATE UNIQUE INDEX idx_unique_booking_email 
ON public.bookings (class_id, guest_email)
WHERE status != 'cancelled';
