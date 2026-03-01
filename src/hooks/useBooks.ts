import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Book, MasonicGrade } from '@/lib/library-types';
import { GRADE_HIERARCHY } from '@/lib/library-types';

export function useBooks(userGrade: MasonicGrade = 'aprendiz') {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const maxGradeLevel = GRADE_HIERARCHY[userGrade];

  const visibleGrades = Object.entries(GRADE_HIERARCHY)
    .filter(([_, level]) => level <= maxGradeLevel)
    .map(([grade]) => grade) as MasonicGrade[];

  const { data: books, isLoading, error } = useQuery({
    queryKey: ['books', userGrade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*, holder:members!books_current_holder_id_fkey(full_name), owner:members!books_owner_id_fkey(full_name)')
        .in('grade_level', visibleGrades)
        .order('title');

      if (error) throw error;

      return (data || []).map((book: any) => ({
        ...book,
        holder_name: book.holder?.full_name || null,
        owner_name: book.owner?.full_name || null,
      })) as Book[];
    },
  });

  const addBook = useMutation({
    mutationFn: async (book: Omit<Book, 'id' | 'created_at' | 'updated_at' | 'holder_name' | 'owner_name'>) => {
      const { error } = await supabase.from('books').insert(book as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      toast.success(t('library.bookAdded'));
    },
    onError: () => toast.error(t('library.bookAddError')),
  });

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
