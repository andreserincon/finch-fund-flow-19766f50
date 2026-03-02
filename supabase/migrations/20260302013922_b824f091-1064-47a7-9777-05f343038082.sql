
-- Create digital_books table
CREATE TABLE public.digital_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text NOT NULL,
  description text,
  grade_level masonic_grade NOT NULL DEFAULT 'aprendiz',
  file_path text NOT NULL,
  file_size_bytes bigint,
  uploaded_by uuid NOT NULL,
  is_approved boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.digital_books ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view approved books (filtered by grade in app)
CREATE POLICY "Authenticated users can view approved digital books"
  ON public.digital_books FOR SELECT
  USING (is_approved = true AND auth.uid() IS NOT NULL);

-- Bibliotecario can view all (including unapproved)
CREATE POLICY "Bibliotecario can view all digital books"
  ON public.digital_books FOR SELECT
  USING (is_bibliotecario(auth.uid()));

-- Users can view own uploads (even if not approved)
CREATE POLICY "Users can view own uploads"
  ON public.digital_books FOR SELECT
  USING (uploaded_by = auth.uid());

-- Any authenticated user can upload
CREATE POLICY "Authenticated users can insert digital books"
  ON public.digital_books FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND uploaded_by = auth.uid());

-- Bibliotecario can update (approve)
CREATE POLICY "Bibliotecario can update digital books"
  ON public.digital_books FOR UPDATE
  USING (is_bibliotecario(auth.uid()));

-- Bibliotecario or uploader can delete
CREATE POLICY "Bibliotecario or uploader can delete digital books"
  ON public.digital_books FOR DELETE
  USING (is_bibliotecario(auth.uid()) OR uploaded_by = auth.uid());

-- Create storage bucket for digital books
INSERT INTO storage.buckets (id, name, public)
VALUES ('digital-books', 'digital-books', false);

-- Storage RLS: authenticated users can upload
CREATE POLICY "Authenticated users can upload digital books"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'digital-books' AND auth.uid() IS NOT NULL);

-- Storage RLS: authenticated users can read (app-level grade filtering)
CREATE POLICY "Authenticated users can read digital books"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'digital-books' AND auth.uid() IS NOT NULL);

-- Storage RLS: bibliotecario or uploader can delete
CREATE POLICY "Bibliotecario or owner can delete digital book files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'digital-books' AND (is_bibliotecario(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text));
