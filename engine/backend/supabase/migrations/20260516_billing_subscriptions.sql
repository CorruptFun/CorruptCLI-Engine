-- 20260516_billing_subscriptions.sql
CREATE TABLE public.subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    plan_interval TEXT NOT NULL, -- e.g., '1-month', '3-month'
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL, -- 'active', 'canceled', 'past_due', 'unpaid'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscriptions
CREATE POLICY "Users can view own subscriptions" 
    ON public.subscriptions FOR SELECT 
    USING (auth.uid() = user_id);

-- Performance Indexes
CREATE INDEX idx_subs_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subs_stripe_sub_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_subs_period_end ON public.subscriptions(current_period_end);
