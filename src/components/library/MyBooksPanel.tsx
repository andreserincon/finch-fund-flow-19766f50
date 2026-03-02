import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BookCard } from './BookCard';
import { EditBookDialog } from './EditBookDialog';
import { DeleteBookDialog } from './DeleteBookDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BookOpen, Package, HandHelping, Pencil, Trash2 } from 'lucide-react';
import type { Book } from '@/lib/library-types';

export function MyBooksPanel({ onSelectBook }: { onSelectBook: (book: Book) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [deleteBook, setDeleteBook] = useState<Book | null>(null);

  const { data: memberId } = useQuery({
    queryKey: ['user-member-id', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('member_id')
        .eq('id', user.id)
        .maybeSingle();
      return data?.member_id || null;
    },
    enabled: !!user?.id,
  });

  const { data: myBooks, isLoading } = useQuery({
    queryKey: ['my-books', memberId],
    queryFn: async () => {
      if (!memberId) return { owned: [], holding: [] };

      const { data, error } = await supabase
        .from('books')
        .select('*, holder:members!books_current_holder_id_fkey(full_name), owner:members!books_owner_id_fkey(full_name)')
        .or(`owner_id.eq.${memberId},current_holder_id.eq.${memberId}`)
        .order('title');

      if (error) throw error;

      const books = (data || []).map((book: any) => ({
        ...book,
        holder_name: book.holder?.full_name || null,
        owner_name: book.owner?.full_name || null,
      })) as Book[];

      return {
        owned: books.filter(b => b.owner_id === memberId),
        holding: books.filter(b => b.current_holder_id === memberId && b.owner_id !== memberId),
      };
    },
    enabled: !!memberId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  const owned = myBooks?.owned || [];
  const holding = myBooks?.holding || [];
  const hasBooks = owned.length > 0 || holding.length > 0;

  if (!hasBooks) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p>{t('library.noMyBooks')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {owned.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {t('library.myOwnedBooks')} ({owned.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {owned.map((book) => (
              <div key={book.id} className="relative group">
                <BookCard book={book} onClick={() => onSelectBook(book)} />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); setEditBook(book); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); setDeleteBook(book); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {holding.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <HandHelping className="h-4 w-4 text-primary" />
            {t('library.myHeldBooks')} ({holding.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {holding.map((book) => (
              <BookCard key={book.id} book={book} onClick={() => onSelectBook(book)} />
            ))}
          </div>
        </div>
      )}

      {editBook && (
        <EditBookDialog book={editBook} open={!!editBook} onClose={() => setEditBook(null)} />
      )}

      {deleteBook && (
        <DeleteBookDialog book={deleteBook} open={!!deleteBook} onClose={() => setDeleteBook(null)} />
      )}
    </div>
  );
}
