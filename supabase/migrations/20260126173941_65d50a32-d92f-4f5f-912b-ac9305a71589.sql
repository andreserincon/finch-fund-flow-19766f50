-- Create loan status enum
CREATE TYPE public.loan_status AS ENUM ('active', 'paid', 'cancelled');

-- Create loans table
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  account public.account_type NOT NULL, -- 'bank' for ARS, 'savings' for USD
  status public.loan_status NOT NULL DEFAULT 'active',
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_date DATE,
  notes TEXT,
  disbursement_transaction_id UUID REFERENCES public.transactions(id),
  repayment_transaction_id UUID REFERENCES public.transactions(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Treasurers can view loans"
ON public.loans FOR SELECT
USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can insert loans"
ON public.loans FOR INSERT
WITH CHECK (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update loans"
ON public.loans FOR UPDATE
USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete loans"
ON public.loans FOR DELETE
USING (is_treasurer(auth.uid()));

-- Members can view their own loans
CREATE POLICY "Members can view own loans"
ON public.loans FOR SELECT
USING (member_id = get_user_member_id(auth.uid()));

-- Create updated_at trigger
CREATE TRIGGER update_loans_updated_at
BEFORE UPDATE ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add loan transaction categories to the enum
ALTER TYPE public.transaction_category ADD VALUE 'loan_disbursement';
ALTER TYPE public.transaction_category ADD VALUE 'loan_repayment';