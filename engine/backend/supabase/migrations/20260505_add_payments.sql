-- Add price to classes (Defaulting to the $30 Group Class rate)
ALTER TABLE public.classes ADD COLUMN price NUMERIC(10, 2) DEFAULT 30.00;

-- Track payment intent and status on bookings
ALTER TABLE public.bookings ADD COLUMN payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'stripe'));
ALTER TABLE public.bookings ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid'));

-- Note: If website pricing changes, update the price column in the classes table 
-- so Stripe processes the correct amount.
