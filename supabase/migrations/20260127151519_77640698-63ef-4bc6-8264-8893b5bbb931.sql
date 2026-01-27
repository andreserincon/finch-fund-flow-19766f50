-- Update RLS policies to allow VM users to view all data
-- Using the existing can_view() function that checks for 'treasurer' or 'vm' roles

-- account_transfers: Allow VM to view
DROP POLICY IF EXISTS "Treasurers can view transfers" ON public.account_transfers;
CREATE POLICY "Admins and VM can view transfers" ON public.account_transfers
  FOR SELECT USING (can_view(auth.uid()));

-- event_member_payments: Allow VM to view all
DROP POLICY IF EXISTS "Treasurers can view event member payments" ON public.event_member_payments;
CREATE POLICY "Admins and VM can view event member payments" ON public.event_member_payments
  FOR SELECT USING (can_view(auth.uid()));

-- extraordinary_expenses: Allow VM to view all
DROP POLICY IF EXISTS "Treasurers can view extraordinary expenses" ON public.extraordinary_expenses;
CREATE POLICY "Admins and VM can view extraordinary expenses" ON public.extraordinary_expenses
  FOR SELECT USING (can_view(auth.uid()));

-- loan_payments: Allow VM to view
DROP POLICY IF EXISTS "Treasurers can view loan payments" ON public.loan_payments;
CREATE POLICY "Admins and VM can view loan payments" ON public.loan_payments
  FOR SELECT USING (can_view(auth.uid()));

-- loans: Allow VM to view all
DROP POLICY IF EXISTS "Treasurers can view loans" ON public.loans;
CREATE POLICY "Admins and VM can view loans" ON public.loans
  FOR SELECT USING (can_view(auth.uid()));

-- member_fee_type_history: Allow VM to view all
DROP POLICY IF EXISTS "Treasurers can view fee type history" ON public.member_fee_type_history;
CREATE POLICY "Admins and VM can view fee type history" ON public.member_fee_type_history
  FOR SELECT USING (can_view(auth.uid()));

-- members: Allow VM to view all
DROP POLICY IF EXISTS "Treasurers can view all members" ON public.members;
CREATE POLICY "Admins and VM can view all members" ON public.members
  FOR SELECT USING (can_view(auth.uid()));

-- organization_settings: Allow VM to view
DROP POLICY IF EXISTS "Treasurers can view settings" ON public.organization_settings;
CREATE POLICY "Admins and VM can view settings" ON public.organization_settings
  FOR SELECT USING (can_view(auth.uid()));

-- transactions: Allow VM to view all
DROP POLICY IF EXISTS "Treasurers can view all transactions" ON public.transactions;
CREATE POLICY "Admins and VM can view all transactions" ON public.transactions
  FOR SELECT USING (can_view(auth.uid()));

-- user_roles: Allow VM to view all roles (read-only)
CREATE POLICY "VM can view all roles" ON public.user_roles
  FOR SELECT USING (can_view(auth.uid()));