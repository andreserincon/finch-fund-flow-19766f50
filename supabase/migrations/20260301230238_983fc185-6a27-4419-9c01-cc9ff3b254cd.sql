
-- Create enums for library module
CREATE TYPE public.masonic_grade AS ENUM ('aprendiz', 'companero', 'maestro');
CREATE TYPE public.book_status AS ENUM ('available', 'on_loan');
CREATE TYPE public.transfer_request_status AS ENUM ('pending', 'approved', 'rejected');

-- Add masonic_grade to members table
ALTER TABLE public.members ADD COLUMN masonic_grade public.masonic_grade NOT NULL DEFAULT 'aprendiz';

-- Create books table
CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text NOT NULL,
  edition text,
  publication_date date,
  description text,
  grade_level public.masonic_grade NOT NULL DEFAULT 'aprendiz',
  current_holder_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  held_since date,
  status public.book_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create book_transfer_requests table
CREATE TABLE public.book_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  new_holder_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status public.transfer_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger for updated_at on books
CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Security definer function for bibliotecario check
CREATE OR REPLACE FUNCTION public.is_bibliotecario(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'bibliotecario'
  )
$$;

-- Function to get user's masonic grade
CREATE OR REPLACE FUNCTION public.get_user_masonic_grade(_user_id uuid)
RETURNS public.masonic_grade
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.masonic_grade
  FROM public.members m
  JOIN public.profiles p ON p.member_id = m.id
  WHERE p.id = _user_id
$$;

-- Enable RLS
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_transfer_requests ENABLE ROW LEVEL SECURITY;

-- Books RLS: All authenticated can view
CREATE POLICY "Authenticated users can view books"
ON public.books FOR SELECT TO authenticated
USING (true);

-- Books: Only bibliotecario can insert/update/delete
CREATE POLICY "Bibliotecario can insert books"
ON public.books FOR INSERT TO authenticated
WITH CHECK (is_bibliotecario(auth.uid()));

CREATE POLICY "Bibliotecario can update books"
ON public.books FOR UPDATE TO authenticated
USING (is_bibliotecario(auth.uid()));

CREATE POLICY "Bibliotecario can delete books"
ON public.books FOR DELETE TO authenticated
USING (is_bibliotecario(auth.uid()));

-- Transfer requests RLS
CREATE POLICY "Users can view own transfer requests"
ON public.book_transfer_requests FOR SELECT TO authenticated
USING (requested_by = auth.uid());

CREATE POLICY "Bibliotecario can view all transfer requests"
ON public.book_transfer_requests FOR SELECT TO authenticated
USING (is_bibliotecario(auth.uid()));

CREATE POLICY "Authenticated users can create transfer requests"
ON public.book_transfer_requests FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Bibliotecario can update transfer requests"
ON public.book_transfer_requests FOR UPDATE TO authenticated
USING (is_bibliotecario(auth.uid()));
