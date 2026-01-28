-- Create enum for report status
CREATE TYPE public.report_status AS ENUM ('generating', 'generated', 'failed');

-- Main monthly reports table
CREATE TABLE public.monthly_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_year INTEGER NOT NULL,
  report_month INTEGER NOT NULL CHECK (report_month >= 1 AND report_month <= 12),
  status report_status NOT NULL DEFAULT 'generating',
  generated_at TIMESTAMP WITH TIME ZONE,
  generated_by UUID REFERENCES auth.users(id),
  pdf_path TEXT,
  -- Financial snapshot at generation time
  bank_balance NUMERIC NOT NULL DEFAULT 0,
  great_lodge_balance NUMERIC NOT NULL DEFAULT 0,
  savings_balance NUMERIC NOT NULL DEFAULT 0,
  total_inflows NUMERIC NOT NULL DEFAULT 0,
  total_outflows NUMERIC NOT NULL DEFAULT 0,
  net_result NUMERIC NOT NULL DEFAULT 0,
  outstanding_member_debt NUMERIC NOT NULL DEFAULT 0,
  prepaid_member_credit NUMERIC NOT NULL DEFAULT 0,
  net_treasury_position NUMERIC NOT NULL DEFAULT 0,
  -- Monthly fee coverage
  expected_monthly_fees NUMERIC NOT NULL DEFAULT 0,
  collected_monthly_fees NUMERIC NOT NULL DEFAULT 0,
  collection_percentage NUMERIC NOT NULL DEFAULT 0,
  members_missing_payment INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(report_year, report_month)
);

-- Member snapshots for each report
CREATE TABLE public.report_member_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  fee_type public.fee_type NOT NULL,
  monthly_fee_amount NUMERIC NOT NULL,
  balance_at_month_end NUMERIC NOT NULL,
  status TEXT NOT NULL, -- 'up_to_date', 'ahead', 'overdue'
  months_ahead INTEGER DEFAULT 0,
  months_overdue INTEGER DEFAULT 0,
  overdue_amount NUMERIC DEFAULT 0,
  last_payment_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Loan snapshots for each report
CREATE TABLE public.report_loan_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL,
  borrower_name TEXT NOT NULL,
  account public.account_type NOT NULL,
  original_amount NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL,
  outstanding_balance NUMERIC NOT NULL,
  payment_status TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Event snapshots for each report
CREATE TABLE public.report_event_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.monthly_reports(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  event_name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  amount_collected NUMERIC NOT NULL,
  outstanding_amount NUMERIC NOT NULL,
  members_included INTEGER NOT NULL,
  members_unpaid INTEGER NOT NULL,
  event_status TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_member_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_loan_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_event_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for monthly_reports
CREATE POLICY "Treasurers and VM can view reports"
  ON public.monthly_reports FOR SELECT
  USING (can_view(auth.uid()));

CREATE POLICY "Treasurers can insert reports"
  ON public.monthly_reports FOR INSERT
  WITH CHECK (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update reports"
  ON public.monthly_reports FOR UPDATE
  USING (is_treasurer(auth.uid()));

-- RLS Policies for report_member_snapshots
CREATE POLICY "Treasurers and VM can view member snapshots"
  ON public.report_member_snapshots FOR SELECT
  USING (can_view(auth.uid()));

CREATE POLICY "Treasurers can insert member snapshots"
  ON public.report_member_snapshots FOR INSERT
  WITH CHECK (is_treasurer(auth.uid()));

-- RLS Policies for report_loan_snapshots
CREATE POLICY "Treasurers and VM can view loan snapshots"
  ON public.report_loan_snapshots FOR SELECT
  USING (can_view(auth.uid()));

CREATE POLICY "Treasurers can insert loan snapshots"
  ON public.report_loan_snapshots FOR INSERT
  WITH CHECK (is_treasurer(auth.uid()));

-- RLS Policies for report_event_snapshots
CREATE POLICY "Treasurers and VM can view event snapshots"
  ON public.report_event_snapshots FOR SELECT
  USING (can_view(auth.uid()));

CREATE POLICY "Treasurers can insert event snapshots"
  ON public.report_event_snapshots FOR INSERT
  WITH CHECK (is_treasurer(auth.uid()));

-- Create storage bucket for reports
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

-- Storage policies
CREATE POLICY "Treasurers and VM can view report files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reports' AND can_view(auth.uid()));

CREATE POLICY "Treasurers can upload report files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'reports' AND is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update report files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'reports' AND is_treasurer(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_monthly_reports_updated_at
  BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();