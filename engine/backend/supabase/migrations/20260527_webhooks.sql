-- Add status to classes for cancellation alerts
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Webhook: Booking Alerts (booking_alert_updates)
-- Triggered on INSERT to bookings, or UPDATE to status = 'cancelled'
CREATE OR REPLACE FUNCTION public.handle_booking_webhook()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
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

DROP TRIGGER IF EXISTS on_booking_webhook ON public.bookings;
CREATE TRIGGER on_booking_webhook
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_webhook();


-- Webhook: Class Rescheduling/Instructor Alerts
-- Triggered on UPDATE to classes
CREATE OR REPLACE FUNCTION public.handle_class_webhook()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (NEW.instructor_name IS DISTINCT FROM OLD.instructor_name OR (NEW.status = 'canceled' AND (OLD.status IS NULL OR OLD.status != 'canceled'))) THEN
    PERFORM net.http_post(
      url := coalesce(current_setting('app.settings.edge_function_url', true), 'https://{{SUPABASE_URL_HOST}}/functions/v1/class-alert'),
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

DROP TRIGGER IF EXISTS on_class_webhook ON public.classes;
CREATE TRIGGER on_class_webhook
  AFTER UPDATE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_class_webhook();
