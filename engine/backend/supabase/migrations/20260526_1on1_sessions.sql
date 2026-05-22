-- 20260526_1on1_sessions.sql
-- Add support for Private 1:1 sessions and tracking session credits

-- 1. Update Customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS one_on_one_credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_goal_summary TEXT;

-- 2. Update Classes table
ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS assigned_customer_email TEXT;

-- 3. Function to atomically deduct 1:1 credits
CREATE OR REPLACE FUNCTION deduct_one_on_one_credit(user_email text, amount integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_credits integer;
BEGIN
    SELECT one_on_one_credits INTO current_credits 
    FROM customers 
    WHERE email = user_email;

    IF current_credits IS NULL OR current_credits < amount THEN
        RETURN false;
    END IF;

    UPDATE customers 
    SET one_on_one_credits = one_on_one_credits - amount 
    WHERE email = user_email;

    RETURN true;
END;
$$;
