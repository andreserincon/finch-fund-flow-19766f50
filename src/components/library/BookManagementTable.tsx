import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, QrCode, CheckCircle2, XCircle } from 'lucide-react';
import { useBooks } from '@/hooks/useBooks';
import { EditBookDialog } from './EditBookDialog';
import { DeleteBookDialog } from './DeleteBookDialog';
import { BookQRLabel } from './BookQRLabel';
import type { Book } from '@/lib/library-types';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function BookManagementTable() {
  const { t } = useTranslation();
  const { books, isLoading, updateBook } = useBooks('maestro');
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [deleteBook, setDeleteBook] = useState<Book | null>(null);
  const [qrBook, setQrBook] = useState<Book | null>(null);

  if (isLoading) return <p className="text-muted-foreground p-4">{t('common.loading')}</p>;

  const pendingBooks = books.filter(b => !b.is_approved);
  const approvedBooks = books.filter(b => b.is_approved);

  const handleApprove = (book: Book) => {
    updateBook.mutate({ id: book.id, is_approved: true } as any);
  };

  return (
    <>
      {pendingBooks.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            {t('library.pendingApproval')} ({pendingBooks.length})
          </h3>
          <div className="border border-amber-500/30 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('library.bookTitle')}</TableHead>
                  <TableHead>{t('library.author')}</TableHead>
                  <TableHead>{t('library.gradeLevel')}</TableHead>
                  <TableHead>{t('library.owner')}</TableHead>
                  <TableHead className="w-24">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingBooks.map((book) => (
                  <TableRow key={book.id}>
                    <TableCell className="font-medium">{book.title}</TableCell>
                    <TableCell>{book.author}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{book.owner_name || t('library.ownerLodge')}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleApprove(book)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteBook(book)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('library.bookTitle')}</TableHead>
              <TableHead>{t('library.author')}</TableHead>
              <TableHead>{t('library.gradeLevel')}</TableHead>
              <TableHead>{t('library.owner')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('library.holder')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {approvedBooks.map((book) => (
              <TableRow key={book.id}>
                <TableCell className="font-medium">{book.title}</TableCell>
                <TableCell>{book.author}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
                </TableCell>
                <TableCell className="text-sm">{book.owner_name || t('library.ownerLodge')}</TableCell>
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
            {approvedBooks.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
