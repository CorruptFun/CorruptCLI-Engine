-- Function to verify class capacity before booking
CREATE OR REPLACE FUNCTION check_class_capacity()
RETURNS TRIGGER AS $$
DECLARE
    current_count INT;
    max_capacity INT;
BEGIN
    -- Get current confirmed bookings count for this class
    SELECT booked_count, capacity INTO current_count, max_capacity
    FROM class_availability
    WHERE id = NEW.class_id;

    -- If the class is full, abort the insert
    IF current_count >= max_capacity THEN
        RAISE EXCEPTION 'This class is already at full capacity (%)', max_capacity;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run before each booking insert
DROP TRIGGER IF EXISTS tr_check_capacity ON bookings;
CREATE TRIGGER tr_check_capacity
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION check_class_capacity();
