-- Add approval column: bibliotecario-added books are auto-approved
ALTER TABLE public.books ADD COLUMN is_approved boolean NOT NULL DEFAULT false;

-- Auto-approve all existing books
UPDATE public.books SET is_approved = true;