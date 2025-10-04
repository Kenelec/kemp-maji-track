-- Create a function to automatically mark payments as overdue after 48 hours
CREATE OR REPLACE FUNCTION mark_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update payments to overdue if:
  -- 1. Status is 'pending'
  -- 2. Due date is more than 48 hours ago
  UPDATE payments
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < (CURRENT_DATE - INTERVAL '2 days');
END;
$$;

-- Create a trigger to run this function after each delivery is created
-- This checks if there are pending payments that should be overdue
CREATE OR REPLACE FUNCTION check_overdue_after_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM mark_overdue_payments();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_overdue_after_delivery ON deliveries;
CREATE TRIGGER trigger_check_overdue_after_delivery
AFTER INSERT ON deliveries
FOR EACH STATEMENT
EXECUTE FUNCTION check_overdue_after_delivery();