-- Create enum for reminder statuses
CREATE TYPE public.reminder_status AS ENUM (
  'pending_review',
  'sent',
  'failed',
  'dismissed'
);

-- Create payment_reminders table
CREATE TABLE public.payment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  amount_owed NUMERIC(12,2) NOT NULL DEFAULT 0,
  whatsapp_number TEXT,
  draft_message TEXT,
  status public.reminder_status NOT NULL DEFAULT 'pending_review',
  failure_reason TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (member_id, period_year, period_month)
);

-- Enable RLS
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies: treasury staff can view all reminders
CREATE POLICY "Treasury staff can view all reminders"
ON public.payment_reminders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'treasurer') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm'));

-- RLS policies: treasury staff can insert reminders
CREATE POLICY "Treasury staff can insert reminders"
ON public.payment_reminders
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'treasurer') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm'));

-- RLS policies: treasury staff can update reminders
CREATE POLICY "Treasury staff can update reminders"
ON public.payment_reminders
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'treasurer') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm'));

-- RLS policies: treasury staff can delete reminders
CREATE POLICY "Treasury staff can delete reminders"
ON public.payment_reminders
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'treasurer') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm'));

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_payment_reminders_updated_at
BEFORE UPDATE ON public.payment_reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();