-- Add owner_id to books (null = lodge property, uuid = member property)
ALTER TABLE public.books 
ADD COLUMN owner_id uuid REFERENCES public.members(id) ON DELETE SET NULL;

-- Update existing RLS: any authenticated user can insert books (setting themselves as owner)
DROP POLICY IF EXISTS "Bibliotecario can insert books" ON public.books;

CREATE POLICY "Authenticated users can insert own books"
ON public.books FOR INSERT
TO authenticated
WITH CHECK (
  -- Bibliotecario/admin can insert any book (including lodge books with owner_id = null)
  is_bibliotecario(auth.uid())
  OR
  -- Regular users can only insert books they own
  (owner_id = get_user_member_id(auth.uid()))
);

-- Update delete: owners can delete their own books, bibliotecario can delete any
DROP POLICY IF EXISTS "Bibliotecario can delete books" ON public.books;

CREATE POLICY "Owners and bibliotecario can delete books"
ON public.books FOR DELETE
TO authenticated
USING (
  is_bibliotecario(auth.uid())
  OR
  (owner_id = get_user_member_id(auth.uid()))
);

-- Update update: owners can update their own books, bibliotecario can update any
DROP POLICY IF EXISTS "Bibliotecario can update books" ON public.books;

CREATE POLICY "Owners and bibliotecario can update books"
ON public.books FOR UPDATE
TO authenticated
USING (
  is_bibliotecario(auth.uid())
  OR
  (owner_id = get_user_member_id(auth.uid()))
);