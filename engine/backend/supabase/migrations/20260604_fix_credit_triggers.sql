-- ============================================================
-- Fix: Extend credit deduction trigger to handle 'credits' payment_method
-- AND add pre-insert validation to prevent booking without sufficient credits
-- ============================================================

-- 1. Replace deduction trigger to handle BOTH 'credits' and 'membership' (non-unlimited)
CREATE OR REPLACE FUNCTION handle_credit_deduction()
RETURNS TRIGGER AS $$
DECLARE
    current_credits integer;
    is_unlimited boolean;
    credits_expired boolean;
BEGIN
    -- Only process credit-consuming payment methods
    IF NEW.payment_method IN ('credits', 'membership') AND NEW.guest_email IS NOT NULL THEN
        -- Check if the user is an unlimited member (no credit tracking needed)
        SELECT 
            COALESCE(class_credits, 0),
            (membership_type ILIKE '%unlimited%' OR membership_type = 'Founder'),
            (credits_expires_at IS NOT NULL AND credits_expires_at < now())
        INTO current_credits, is_unlimited, credits_expired
        FROM public.customers 
        WHERE email = NEW.guest_email;

        -- Unlimited members skip credit deduction entirely
        IF is_unlimited THEN
            RETURN NEW;
        END IF;

        -- For 'credits' payment method, validate they have unexpired credits
        IF NEW.payment_method = 'credits' THEN
            IF current_credits <= 0 THEN
                RAISE EXCEPTION 'Insufficient class credits. Please purchase more credits.';
            END IF;
            IF credits_expired THEN
                RAISE EXCEPTION 'Your class credits have expired. Please purchase a new class experience pack.';
            END IF;
        END IF;

        -- Deduct 1 credit
        UPDATE public.customers 
        SET class_credits = GREATEST(0, COALESCE(class_credits, 0) - 1)
        WHERE email = NEW.guest_email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_deduct_credits ON bookings;
CREATE TRIGGER tr_deduct_credits
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION handle_credit_deduction();

-- 2. Update refund trigger to also handle 'credits' cancellations
CREATE OR REPLACE FUNCTION handle_credit_refund()
RETURNS TRIGGER AS $$
DECLARE
    class_start TIMESTAMP WITH TIME ZONE;
    is_late BOOLEAN;
    is_unlimited BOOLEAN;
BEGIN
    -- Process refunds for both credits and membership payment methods
    IF NEW.payment_method IN ('credits', 'membership') AND NEW.guest_email IS NOT NULL AND NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        -- Check if unlimited member
        SELECT (membership_type ILIKE '%unlimited%' OR membership_type = 'Founder')
        INTO is_unlimited
        FROM public.customers WHERE email = NEW.guest_email;

        IF is_unlimited THEN
            RETURN NEW;  -- No credit to refund for unlimited members
        END IF;

        -- Get the class start time
        SELECT start_time INTO class_start FROM public.classes WHERE id = NEW.class_id;
        
        -- Check if cancellation is late (< 24 hours)
        is_late := (EXTRACT(EPOCH FROM (class_start - now())) / 3600) < 24;
        
        IF NOT is_late THEN
            UPDATE public.customers 
            SET class_credits = COALESCE(class_credits, 0) + 1
            WHERE email = NEW.guest_email;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_refund_credits ON bookings;
CREATE TRIGGER tr_refund_credits
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION handle_credit_refund();
