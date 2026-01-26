-- Add unique constraint to prevent duplicate fee type history entries for the same member and month
ALTER TABLE public.member_fee_type_history
ADD CONSTRAINT member_fee_type_history_member_month_unique 
UNIQUE (member_id, effective_from);