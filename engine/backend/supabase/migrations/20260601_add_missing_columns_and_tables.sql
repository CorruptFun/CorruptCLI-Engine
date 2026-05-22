-- Fix #5: Add last_processed_session_id column for Stripe idempotency
-- Fix #6: Add error_logs table for Edge Function error tracking
-- These are referenced by verify-membership-payment and stripe-membership-checkout
-- but were never created in any migration.

-- Idempotency column for Stripe session deduplication
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS last_processed_session_id TEXT;

-- Error logging table for Edge Function diagnostics
CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    source TEXT,        -- e.g. 'edge-function', 'webhook', 'cron'
    context TEXT,       -- e.g. 'stripe-membership-checkout', 'booking-alert'
    message TEXT,
    stack TEXT,
    metadata JSONB
);

-- Allow service role to insert error logs (no public access needed)
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage error_logs"
    ON public.error_logs
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
