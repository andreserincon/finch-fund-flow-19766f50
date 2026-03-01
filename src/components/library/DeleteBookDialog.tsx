import { useTranslation } from 'react-i18next';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useBooks } from '@/hooks/useBooks';
import type { Book } from '@/lib/library-types';

interface DeleteBookDialogProps {
  book: Book;
  open: boolean;
  onClose: () => void;
}

export function DeleteBookDialog({ book, open, onClose }: DeleteBookDialogProps) {
  const { t } = useTranslation();
  const { deleteBook } = useBooks('maestro');

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('library.deleteBook')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('library.deleteConfirm', { title: book.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteBook.mutate(book.id, { onSuccess: onClose })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
