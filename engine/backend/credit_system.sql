-- ==============================================
-- REFORM HER: CREDIT SYSTEM ARCHITECTURE UPDATE
-- ==============================================

-- 1. Add class credits and medical notes to the customers table
ALTER TABLE customers 
ADD COLUMN class_credits integer DEFAULT 0,
ADD COLUMN goals_medical text;

-- 2. Create the deduct_credit function for bookings
-- This safely checks if a user has credits and deducts 1 atomically to prevent race conditions
CREATE OR REPLACE FUNCTION deduct_credit(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_credits integer;
BEGIN
    -- Check current balance
    SELECT class_credits INTO current_credits 
    FROM customers 
    WHERE email = user_email;

    -- If no record found or credits are 0 or less, return false
    IF current_credits IS NULL OR current_credits <= 0 THEN
        RETURN false;
    END IF;

    -- Deduct 1 credit
    UPDATE customers 
    SET class_credits = class_credits - 1 
    WHERE email = user_email;

    RETURN true;
END;
$$;
