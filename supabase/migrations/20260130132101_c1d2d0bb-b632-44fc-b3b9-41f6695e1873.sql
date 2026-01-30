-- Add lite_pdf_path column to store the simplified report
ALTER TABLE public.monthly_reports
ADD COLUMN lite_pdf_path text;