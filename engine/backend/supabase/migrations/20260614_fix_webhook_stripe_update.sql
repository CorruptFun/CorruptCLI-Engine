-- ============================================================
-- Fix: Booking webhook was not firing for Stripe payment confirmations
-- The webhook only fired for INSERT and status→cancelled transitions,
-- but verify-payment updates payment_status (not status) to 'paid'.
-- This caused the "You're Booked!" confirmation email to never send
-- for per-class Stripe payments.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_booking_webhook()
RETURNS TRIGGER AS $$
BEGIN
  -- Fire on: INSERT, cancellation, or Stripe payment confirmation
  IF (TG_OP = 'INSERT')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled')
     OR (TG_OP = 'UPDATE' AND NEW.payment_status = 'paid' AND OLD.payment_status = 'pending')
  THEN
    PERFORM net.http_post(
      url := coalesce(current_setting('app.settings.edge_function_url', true), '{{SUPABASE_URL}}/functions/v1/booking-alert'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', current_setting('app.settings.edge_function_anon_key', true)
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'record', row_to_json(NEW),
        'old_record', row_to_json(OLD)
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
