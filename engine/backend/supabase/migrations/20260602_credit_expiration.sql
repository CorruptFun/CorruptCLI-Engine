-- Add credit expiration tracking
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credits_expires_at TIMESTAMPTZ;
