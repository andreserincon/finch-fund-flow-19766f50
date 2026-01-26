-- Create a table for monthly fee rates
CREATE TABLE public.monthly_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year_month DATE NOT NULL,
  fee_type public.fee_type NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(year_month, fee_type)
);

-- Enable RLS
ALTER TABLE public.monthly_fees ENABLE ROW LEVEL SECURITY;

-- Treasurers can manage monthly fees
CREATE POLICY "Treasurers can view monthly fees"
ON public.monthly_fees FOR SELECT
USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can insert monthly fees"
ON public.monthly_fees FOR INSERT
WITH CHECK (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update monthly fees"
ON public.monthly_fees FOR UPDATE
USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete monthly fees"
ON public.monthly_fees FOR DELETE
USING (is_treasurer(auth.uid()));

-- Members can view monthly fees (to see their applicable rate)
CREATE POLICY "Members can view monthly fees"
ON public.monthly_fees FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_monthly_fees_updated_at
BEFORE UPDATE ON public.monthly_fees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert current month's default fees
INSERT INTO public.monthly_fees (year_month, fee_type, amount) VALUES
  (DATE_TRUNC('month', CURRENT_DATE), 'standard', 0),
  (DATE_TRUNC('month', CURRENT_DATE), 'solidarity', 0);