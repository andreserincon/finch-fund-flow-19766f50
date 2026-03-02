/**
 * @file useBooks.ts
 * @description CRUD hook for the physical `books` table.
 *   Books are filtered by the user's masonic grade so that
 *   higher-degree content is only visible to qualified members.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Book, MasonicGrade } from '@/lib/library-types';
import { GRADE_HIERARCHY } from '@/lib/library-types';

export function useBooks(userGrade: MasonicGrade = 'aprendiz', gradeLoaded: boolean = true) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  /** Numeric rank of the user's grade */
  const maxGradeLevel = GRADE_HIERARCHY[userGrade];

  /** Only include grades at or below the user's level */
  const visibleGrades = Object.entries(GRADE_HIERARCHY)
    .filter(([_, level]) => level <= maxGradeLevel)
    .map(([grade]) => grade) as MasonicGrade[];

  /* ── Query: filtered & enriched book list ── */
  const { data: books, isLoading, error } = useQuery({
    queryKey: ['books', userGrade, gradeLoaded],
    enabled: gradeLoaded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*, holder:members!books_current_holder_id_fkey(full_name), owner:members!books_owner_id_fkey(full_name)')
        .in('grade_level', visibleGrades)
        .order('title');

      if (error) throw error;

      // Flatten the joined member names into the book object
      return (data || []).map((book: any) => ({
        ...book,
        holder_name: book.holder?.full_name || null,
        owner_name: book.owner?.full_name || null,
      })) as Book[];
    },
  });

  /* ── Mutation: add a new book ── */
  const addBook = useMutation({
    mutationFn: async (book: Omit<Book, 'id' | 'created_at' | 'updated_at' | 'holder_name' | 'owner_name' | 'is_approved'> & { is_approved?: boolean }) => {
      const { error } = await supabase.from('books').insert(book as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      toast.success(t('library.bookAdded'));
    },
    onError: () => toast.error(t('library.bookAddError')),
  });

  /* ── Mutation: update a book ── */
  const updateBook = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Book> & { id: string }) => {
      const { error } = await supabase.from('books').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      toast.success(t('library.bookUpdated'));
    },
    onError: () => toast.error(t('library.bookUpdateError')),
  });

  /* ── Mutation: delete a book ── */
  const deleteBook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('books').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      toast.success(t('library.bookDeleted'));
    },
    onError: () => toast.error(t('library.bookDeleteError')),
  });

  return { books: books || [], isLoading, error, addBook, updateBook, deleteBook };
}
