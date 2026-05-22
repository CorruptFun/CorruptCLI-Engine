-- Add tracking for waivers, emergency contacts, and missing data to the customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS fitness_goals TEXT,
ADD COLUMN IF NOT EXISTS waiver_signed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS waiver_legal_name TEXT,
ADD COLUMN IF NOT EXISTS waiver_ip_address TEXT,
ADD COLUMN IF NOT EXISTS waiver_photo_release BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS waiver_minor_guardian_name TEXT;
