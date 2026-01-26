-- Create trigger function to insert initial fee type history on member creation
CREATE OR REPLACE FUNCTION public.insert_initial_fee_type_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.member_fee_type_history (member_id, fee_type, effective_from)
  VALUES (NEW.id, NEW.fee_type, date_trunc('month', NEW.join_date)::DATE);
  RETURN NEW;
END;
$$;

-- Create trigger on members table for INSERT
CREATE TRIGGER insert_member_fee_type_history
AFTER INSERT ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.insert_initial_fee_type_history();