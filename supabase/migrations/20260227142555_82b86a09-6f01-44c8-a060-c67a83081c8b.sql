ALTER TABLE monthly_fees
  ADD COLUMN IF NOT EXISTS gl_standard_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gl_solidarity_amount numeric DEFAULT NULL;