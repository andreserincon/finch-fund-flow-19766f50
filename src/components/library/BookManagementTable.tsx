import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, QrCode } from 'lucide-react';
import { useBooks } from '@/hooks/useBooks';
import { EditBookDialog } from './EditBookDialog';
import { DeleteBookDialog } from './DeleteBookDialog';
import { BookQRLabel } from './BookQRLabel';
import type { Book } from '@/lib/library-types';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function BookManagementTable() {
  const { t } = useTranslation();
  const { books, isLoading } = useBooks('maestro');
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [deleteBook, setDeleteBook] = useState<Book | null>(null);
  const [qrBook, setQrBook] = useState<Book | null>(null);

  if (isLoading) return <p className="text-muted-foreground p-4">{t('common.loading')}</p>;

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('library.bookTitle')}</TableHead>
              <TableHead>{t('library.author')}</TableHead>
              <TableHead>{t('library.gradeLevel')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('library.holder')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.map((book) => (
              <TableRow key={book.id}>
                <TableCell className="font-medium">{book.title}</TableCell>
                <TableCell>{book.author}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={book.status === 'available' ? 'default' : 'secondary'}>
                    {book.status === 'available' ? t('library.available') : t('library.onLoan')}
                  </Badge>
                </TableCell>
                <TableCell>{book.holder_name || '—'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditBook(book)}>
                        <Pencil className="h-4 w-4 mr-2" />{t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setQrBook(book)}>
                        <QrCode className="h-4 w-4 mr-2" />{t('library.generateLabel')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteBook(book)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />{t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {books.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t('library.noBooks')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editBook && <EditBookDialog book={editBook} open={!!editBook} onClose={() => setEditBook(null)} />}
      {deleteBook && <DeleteBookDialog book={deleteBook} open={!!deleteBook} onClose={() => setDeleteBook(null)} />}
      {qrBook && (
        <Dialog open={!!qrBook} onOpenChange={(o) => !o && setQrBook(null)}>
          <DialogContent className="sm:max-w-sm">
            <BookQRLabel book={qrBook} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
