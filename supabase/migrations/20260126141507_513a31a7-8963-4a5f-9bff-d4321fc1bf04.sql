-- Add UPDATE policy for treasurers on member_fee_type_history table
CREATE POLICY "Treasurers can update fee type history" 
ON public.member_fee_type_history 
FOR UPDATE 
USING (is_treasurer(auth.uid()))
WITH CHECK (is_treasurer(auth.uid()));