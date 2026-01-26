-- Create enum for account types
CREATE TYPE public.account_type AS ENUM ('bank', 'great_lodge');

-- Add account column to transactions table with default to 'bank'
ALTER TABLE public.transactions 
ADD COLUMN account account_type NOT NULL DEFAULT 'bank';

-- Create a transfers table to track money movements between accounts
CREATE TABLE public.account_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  from_account account_type NOT NULL,
  to_account account_type NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT different_accounts CHECK (from_account != to_account)
);

-- Enable RLS
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for transfers
CREATE POLICY "Treasurers can view transfers"
ON public.account_transfers
FOR SELECT
USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can insert transfers"
ON public.account_transfers
FOR INSERT
WITH CHECK (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update transfers"
ON public.account_transfers
FOR UPDATE
USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete transfers"
ON public.account_transfers
FOR DELETE
USING (is_treasurer(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_account_transfers_updated_at
BEFORE UPDATE ON public.account_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();