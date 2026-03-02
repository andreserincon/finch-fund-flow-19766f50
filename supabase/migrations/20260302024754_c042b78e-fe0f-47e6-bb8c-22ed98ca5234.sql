
-- Function to auto-release books on loan for more than 1 month
CREATE OR REPLACE FUNCTION public.auto_release_overdue_books()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.books
  SET 
    status = 'available',
    current_holder_id = NULL,
    held_since = NULL,
    updated_at = now()
  WHERE status = 'on_loan'
    AND held_since IS NOT NULL
    AND held_since < (CURRENT_DATE - INTERVAL '1 month');
END;
$$;
