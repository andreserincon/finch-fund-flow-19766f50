
ALTER TABLE public.extraordinary_expenses
  ADD COLUMN IF NOT EXISTS charge_from_date date;

ALTER TABLE public.report_member_snapshots
  ADD COLUMN IF NOT EXISTS capita_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS event_balance numeric NOT NULL DEFAULT 0;
