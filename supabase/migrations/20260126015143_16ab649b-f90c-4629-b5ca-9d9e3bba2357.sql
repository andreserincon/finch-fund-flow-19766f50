-- Fix function search paths for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Fix function search path for handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'member');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the security definer view and recreate with security_invoker
DROP VIEW IF EXISTS public.member_balances;

CREATE VIEW public.member_balances
WITH (security_invoker = on) AS
SELECT 
  m.id as member_id,
  m.full_name,
  m.phone_number,
  m.monthly_fee_amount,
  m.fee_type,
  m.is_active,
  m.join_date,
  COALESCE(SUM(
    CASE 
      WHEN t.transaction_type = 'income' THEN t.amount
      WHEN t.transaction_type = 'expense' THEN -t.amount
      ELSE 0
    END
  ), 0) as current_balance,
  EXTRACT(YEAR FROM age(CURRENT_DATE, m.join_date)) * 12 + 
  EXTRACT(MONTH FROM age(CURRENT_DATE, m.join_date)) + 1 as months_since_join,
  (EXTRACT(YEAR FROM age(CURRENT_DATE, m.join_date)) * 12 + 
   EXTRACT(MONTH FROM age(CURRENT_DATE, m.join_date)) + 1) * m.monthly_fee_amount as total_fees_owed
FROM public.members m
LEFT JOIN public.transactions t ON t.member_id = m.id
GROUP BY m.id;