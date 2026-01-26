-- Create loan_payments table to track individual payments
CREATE TABLE public.loan_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Treasurers can view loan payments"
  ON public.loan_payments FOR SELECT
  USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can insert loan payments"
  ON public.loan_payments FOR INSERT
  WITH CHECK (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update loan payments"
  ON public.loan_payments FOR UPDATE
  USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete loan payments"
  ON public.loan_payments FOR DELETE
  USING (is_treasurer(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_loan_payments_updated_at
  BEFORE UPDATE ON public.loan_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();