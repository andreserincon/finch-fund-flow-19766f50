-- Add missing columns to payment_reminders required by the send-whatsapp-reminder edge function
ALTER TABLE public.payment_reminders
  ADD COLUMN IF NOT EXISTS final_message TEXT,
  ADD COLUMN IF NOT EXISTS twilio_message_sid TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add sent_at if missing (may already exist from creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_reminders' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE public.payment_reminders ADD COLUMN sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;