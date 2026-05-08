-- Add tracking for the "First 5" 3-month promo
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS first5_3m_claimed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS first5_3m_used integer DEFAULT 0;
