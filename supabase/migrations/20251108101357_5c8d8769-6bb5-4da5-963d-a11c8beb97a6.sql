-- Add payment tracking fields to deliveries table
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial')),
ADD COLUMN IF NOT EXISTS mpesa_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_reminder_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_link_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries on unpaid deliveries
CREATE INDEX IF NOT EXISTS idx_deliveries_payment_status ON deliveries(payment_status);
CREATE INDEX IF NOT EXISTS idx_deliveries_payment_link_token ON deliveries(payment_link_token);

-- Create function to generate unique payment tokens
CREATE OR REPLACE FUNCTION generate_payment_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  token TEXT;
BEGIN
  token := encode(gen_random_bytes(16), 'hex');
  RETURN token;
END;
$$;

-- Update existing deliveries to have payment tokens
UPDATE deliveries 
SET payment_link_token = generate_payment_token()
WHERE payment_link_token IS NULL;

-- Create trigger to auto-generate payment tokens for new deliveries
CREATE OR REPLACE FUNCTION set_payment_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_link_token IS NULL THEN
    NEW.payment_link_token := generate_payment_token();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payment_token_trigger ON deliveries;
CREATE TRIGGER set_payment_token_trigger
BEFORE INSERT ON deliveries
FOR EACH ROW
EXECUTE FUNCTION set_payment_token();