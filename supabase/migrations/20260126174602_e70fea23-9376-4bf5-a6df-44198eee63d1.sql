-- Add amount_paid column to track partial payments
ALTER TABLE public.loans 
ADD COLUMN amount_paid numeric NOT NULL DEFAULT 0;

-- Add a check constraint to ensure amount_paid doesn't exceed amount
ALTER TABLE public.loans
ADD CONSTRAINT loans_amount_paid_check CHECK (amount_paid >= 0 AND amount_paid <= amount);