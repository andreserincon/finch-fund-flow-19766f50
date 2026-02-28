
-- Function to sync loans when a linked transaction is updated
CREATE OR REPLACE FUNCTION public.sync_loan_on_transaction_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loan_payment RECORD;
  v_loan RECORD;
  v_total_paid numeric;
BEGIN
  -- Handle UPDATE: sync amount changes on loan_repayment transactions
  IF TG_OP = 'UPDATE' THEN
    -- Check if this transaction is linked to a loan_payment
    SELECT * INTO v_loan_payment FROM public.loan_payments WHERE transaction_id = NEW.id;
    IF FOUND THEN
      -- Update the loan_payment amount to match the transaction
      UPDATE public.loan_payments SET amount = NEW.amount WHERE id = v_loan_payment.id;
      
      -- Recalculate the loan's amount_paid from all its payments
      SELECT COALESCE(SUM(lp.amount), 0) INTO v_total_paid
      FROM public.loan_payments lp
      WHERE lp.loan_id = v_loan_payment.loan_id;
      
      -- Get loan to check full payment
      SELECT * INTO v_loan FROM public.loans WHERE id = v_loan_payment.loan_id;
      
      UPDATE public.loans SET 
        amount_paid = v_total_paid,
        status = CASE WHEN v_total_paid >= v_loan.amount THEN 'paid'::loan_status ELSE 'active'::loan_status END,
        paid_date = CASE WHEN v_total_paid >= v_loan.amount THEN CURRENT_DATE ELSE NULL END
      WHERE id = v_loan_payment.loan_id;
    END IF;

    -- Check if this transaction is a loan disbursement
    SELECT * INTO v_loan FROM public.loans WHERE disbursement_transaction_id = NEW.id;
    IF FOUND THEN
      UPDATE public.loans SET amount = NEW.amount WHERE id = v_loan.id;
    END IF;

    RETURN NEW;
  END IF;

  -- Handle DELETE: clean up loan references
  IF TG_OP = 'DELETE' THEN
    -- Check if this transaction is linked to a loan_payment
    SELECT * INTO v_loan_payment FROM public.loan_payments WHERE transaction_id = OLD.id;
    IF FOUND THEN
      -- Delete the loan_payment
      DELETE FROM public.loan_payments WHERE id = v_loan_payment.id;
      
      -- Recalculate loan's amount_paid
      SELECT COALESCE(SUM(lp.amount), 0) INTO v_total_paid
      FROM public.loan_payments lp
      WHERE lp.loan_id = v_loan_payment.loan_id;
      
      SELECT * INTO v_loan FROM public.loans WHERE id = v_loan_payment.loan_id;
      
      IF FOUND THEN
        UPDATE public.loans SET 
          amount_paid = v_total_paid,
          status = CASE WHEN v_total_paid >= v_loan.amount THEN 'paid'::loan_status ELSE 'active'::loan_status END,
          paid_date = CASE WHEN v_total_paid >= v_loan.amount THEN v_loan.paid_date ELSE NULL END,
          repayment_transaction_id = CASE WHEN v_total_paid >= v_loan.amount THEN v_loan.repayment_transaction_id ELSE NULL END
        WHERE id = v_loan_payment.loan_id;
      END IF;
    END IF;

    -- Check if this is a disbursement transaction - clear the reference
    UPDATE public.loans SET disbursement_transaction_id = NULL WHERE disbursement_transaction_id = OLD.id;

    -- Check if this is a repayment transaction reference - clear it
    UPDATE public.loans SET repayment_transaction_id = NULL WHERE repayment_transaction_id = OLD.id;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

-- Create the trigger
CREATE TRIGGER sync_loan_on_transaction_change
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_loan_on_transaction_change();
