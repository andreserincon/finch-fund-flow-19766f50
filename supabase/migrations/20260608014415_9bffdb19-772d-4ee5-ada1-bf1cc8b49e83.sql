
-- Helper: treasurer, vm, admin only (excludes regular members)
CREATE OR REPLACE FUNCTION public.is_staff_or_vm(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('treasurer', 'vm', 'admin')
  )
$$;

-- members
DROP POLICY IF EXISTS "Admins and VM can view all members" ON public.members;
CREATE POLICY "Staff and VM can view all members" ON public.members
  FOR SELECT USING (public.is_staff_or_vm(auth.uid()));

-- loans
DROP POLICY IF EXISTS "Admins and VM can view loans" ON public.loans;
CREATE POLICY "Staff and VM can view loans" ON public.loans
  FOR SELECT USING (public.is_staff_or_vm(auth.uid()));

-- event_member_payments
DROP POLICY IF EXISTS "Admins and VM can view event member payments" ON public.event_member_payments;
CREATE POLICY "Staff and VM can view event member payments" ON public.event_member_payments
  FOR SELECT USING (public.is_staff_or_vm(auth.uid()));

-- transactions
DROP POLICY IF EXISTS "Admins and VM can view all transactions" ON public.transactions;
CREATE POLICY "Staff and VM can view all transactions" ON public.transactions
  FOR SELECT USING (public.is_staff_or_vm(auth.uid()));

-- account_transfers
DROP POLICY IF EXISTS "Admins and VM can view transfers" ON public.account_transfers;
CREATE POLICY "Staff and VM can view transfers" ON public.account_transfers
  FOR SELECT USING (public.is_staff_or_vm(auth.uid()));

-- report_loan_snapshots
DROP POLICY IF EXISTS "Treasurers and VM can view loan snapshots" ON public.report_loan_snapshots;
CREATE POLICY "Staff and VM can view loan snapshots" ON public.report_loan_snapshots
  FOR SELECT USING (public.is_staff_or_vm(auth.uid()));

-- report_member_snapshots
DROP POLICY IF EXISTS "Treasurers and VM can view member snapshots" ON public.report_member_snapshots;
CREATE POLICY "Staff and VM can view member snapshots" ON public.report_member_snapshots
  FOR SELECT USING (public.is_staff_or_vm(auth.uid()));

-- Storage: tighten digital-books SELECT to approved files only
DROP POLICY IF EXISTS "Authenticated users can read digital books" ON storage.objects;
CREATE POLICY "Approved digital books readable by authenticated"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'digital-books'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_bibliotecario(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.digital_books db
        WHERE db.file_path = storage.objects.name
          AND db.is_approved = true
      )
    )
  );

-- Storage: add UPDATE policy for digital-books (bibliotecario or owner folder)
DROP POLICY IF EXISTS "Bibliotecario or owner can update digital book files" ON storage.objects;
CREATE POLICY "Bibliotecario or owner can update digital book files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'digital-books'
    AND (
      public.is_bibliotecario(auth.uid())
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'digital-books'
    AND (
      public.is_bibliotecario(auth.uid())
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
