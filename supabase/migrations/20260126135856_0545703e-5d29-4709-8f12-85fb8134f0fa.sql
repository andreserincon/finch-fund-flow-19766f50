-- Create table to track member fee type history
CREATE TABLE public.member_fee_type_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  fee_type public.fee_type NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.member_fee_type_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Members can view own fee type history"
ON public.member_fee_type_history
FOR SELECT
USING (member_id = get_user_member_id(auth.uid()));

CREATE POLICY "Treasurers can view fee type history"
ON public.member_fee_type_history
FOR SELECT
USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can insert fee type history"
ON public.member_fee_type_history
FOR INSERT
WITH CHECK (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete fee type history"
ON public.member_fee_type_history
FOR DELETE
USING (is_treasurer(auth.uid()));

-- Create index for efficient lookups
CREATE INDEX idx_member_fee_type_history_member_effective 
ON public.member_fee_type_history(member_id, effective_from DESC);

-- Initialize history from existing members (effective from their join date)
INSERT INTO public.member_fee_type_history (member_id, fee_type, effective_from)
SELECT id, fee_type, join_date
FROM public.members;

-- Create function to get fee type for a member at a specific month
CREATE OR REPLACE FUNCTION public.get_member_fee_type_for_month(
  p_member_id UUID,
  p_month DATE
)
RETURNS public.fee_type
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT fee_type
  FROM public.member_fee_type_history
  WHERE member_id = p_member_id
    AND effective_from <= p_month
  ORDER BY effective_from DESC
  LIMIT 1
$$;

-- Create trigger to auto-insert history when fee_type changes
CREATE OR REPLACE FUNCTION public.track_fee_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only insert if fee_type actually changed
  IF OLD.fee_type IS DISTINCT FROM NEW.fee_type THEN
    INSERT INTO public.member_fee_type_history (member_id, fee_type, effective_from)
    VALUES (NEW.id, NEW.fee_type, date_trunc('month', CURRENT_DATE)::DATE);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER member_fee_type_change_trigger
AFTER UPDATE OF fee_type ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.track_fee_type_change();