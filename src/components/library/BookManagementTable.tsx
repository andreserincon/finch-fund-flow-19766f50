import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, QrCode, CheckCircle2, XCircle, FileText, BookOpen, Download, Copy } from 'lucide-react';
import { useBooks } from '@/hooks/useBooks';
import { supabase } from '@/integrations/supabase/client';
import { useDigitalBooks, type DigitalBook } from '@/hooks/useDigitalBooks';
import { useAuth } from '@/hooks/useAuth';
import { EditBookDialog } from './EditBookDialog';
import { DeleteBookDialog } from './DeleteBookDialog';
import { BookQRLabel } from './BookQRLabel';
import type { Book, MasonicGrade } from '@/lib/library-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function BookManagementTable() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { books, isLoading, updateBook } = useBooks('maestro');
  const { digitalBooks, isLoading: digitalLoading, approveBook, rejectBook, updateDigitalBook, getDownloadUrl } = useDigitalBooks('maestro');
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [deleteBook, setDeleteBook] = useState<Book | null>(null);
  const [qrBook, setQrBook] = useState<Book | null>(null);
  const [editDigitalBook, setEditDigitalBook] = useState<DigitalBook | null>(null);
  const [editGrade, setEditGrade] = useState<MasonicGrade>('aprendiz');

  if (isLoading || digitalLoading) return <p className="text-muted-foreground p-4">{t('common.loading')}</p>;

  const pendingPhysical = books.filter(b => !b.is_approved);
  const approvedPhysical = books.filter(b => b.is_approved);
  const pendingDigital = digitalBooks.filter(b => !b.is_approved);
  const approvedDigital = digitalBooks.filter(b => b.is_approved);

  const handleApprovePhysical = (book: Book) => {
    updateBook.mutate({ id: book.id, is_approved: true } as any);
  };

  const handleApproveDigital = (id: string) => {
    if (!user?.id) return;
    approveBook.mutate({ id, approvedBy: user.id });
  };

  const handleRejectDigital = (book: DigitalBook) => {
    rejectBook.mutate(book);
  };

  const handleDownloadDigital = async (book: DigitalBook) => {
    try {
      const url = await getDownloadUrl(book.file_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${book.title}.pdf`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error(t('digitalLibrary.downloadError'));
    }
  };

  const handleCreateCopy = async (book: Book) => {
    try {
      // Find the max copy_number for books with the same title+author
      const siblings = books.filter(
        (b) => b.title === book.title && b.author === book.author
      );
      const maxCopy = Math.max(...siblings.map((b) => b.copy_number || 1), 0);
      const newCopyNumber = maxCopy + 1;

      const { error } = await supabase.from('books').insert({
        title: book.title,
        author: book.author,
        description: book.description,
        edition: book.edition,
        language: book.language,
        publication_date: book.publication_date,
        grade_level: book.grade_level,
        owner_id: book.owner_id,
        copy_number: newCopyNumber,
        is_approved: true,
        status: 'available' as const,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['books'] });
      toast.success(t('library.copyCreated', { number: newCopyNumber }));
    } catch {
      toast.error(t('library.copyCreateError'));
    }
  };

  const totalPending = pendingPhysical.length + pendingDigital.length;

  return (
    <>
      {totalPending > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            {t('library.pendingApproval')} ({totalPending})
          </h3>
          <div className="border border-amber-500/30 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('library.type')}</TableHead>
                  <TableHead>{t('library.bookTitle')}</TableHead>
                  <TableHead>{t('library.author')}</TableHead>
                  <TableHead>{t('library.gradeLevel')}</TableHead>
                  <TableHead className="w-24">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPhysical.map((book) => (
                  <TableRow key={`p-${book.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <BookOpen className="h-3 w-3" />
                        {t('library.physical')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{book.title}</TableCell>
                    <TableCell>{book.author}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleApprovePhysical(book)}
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
                {pendingDigital.map((book) => (
                  <TableRow key={`d-${book.id}`}>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" />
                        PDF
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{book.title}</TableCell>
                    <TableCell>{book.author}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleApproveDigital(book.id)}
                          disabled={approveBook.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleRejectDigital(book)}
                          disabled={rejectBook.isPending}
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

      {/* Physical Books */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          {t('library.physicalBooks')} ({approvedPhysical.length})
        </h3>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                 <TableHead>{t('library.bookTitle')}</TableHead>
                 <TableHead>{t('library.copyNumber')}</TableHead>
                 <TableHead>{t('library.author')}</TableHead>
                <TableHead>{t('library.gradeLevel')}</TableHead>
                <TableHead>{t('library.owner')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('library.holder')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedPhysical.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="font-medium">{book.title}</TableCell>
                  <TableCell className="text-center">{book.copy_number || 1}</TableCell>
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
                        <DropdownMenuItem onClick={() => handleCreateCopy(book)}>
                          <Copy className="h-4 w-4 mr-2" />{t('library.createCopy')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteBook(book)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />{t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {approvedPhysical.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                     {t('library.noBooks')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Digital Books */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {t('digitalLibrary.title')} ({approvedDigital.length})
        </h3>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('library.bookTitle')}</TableHead>
                <TableHead>{t('library.author')}</TableHead>
                <TableHead>{t('library.gradeLevel')}</TableHead>
                <TableHead>{t('common.description')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedDigital.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="font-medium">{book.title}</TableCell>
                  <TableCell>{book.author}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {book.description || '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownloadDigital(book)}>
                          <Download className="h-4 w-4 mr-2" />{t('digitalLibrary.download')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditDigitalBook(book); setEditGrade(book.grade_level); }}>
                          <Pencil className="h-4 w-4 mr-2" />{t('library.editGrade')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRejectDigital(book)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />{t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {approvedDigital.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t('digitalLibrary.noBooks')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
      {editDigitalBook && (
        <Dialog open={!!editDigitalBook} onOpenChange={(o) => !o && setEditDigitalBook(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('library.editGrade')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">{editDigitalBook.title}</p>
              <div className="space-y-2">
                <Label>{t('library.gradeLevel')}</Label>
                <Select value={editGrade} onValueChange={(v) => setEditGrade(v as MasonicGrade)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profano">{t('library.grades.profano')}</SelectItem>
                    <SelectItem value="aprendiz">{t('library.grades.aprendiz')}</SelectItem>
                    <SelectItem value="companero">{t('library.grades.companero')}</SelectItem>
                    <SelectItem value="maestro">{t('library.grades.maestro')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDigitalBook(null)}>{t('common.cancel')}</Button>
              <Button
                onClick={() => {
                  updateDigitalBook.mutate({ id: editDigitalBook.id, grade_level: editGrade }, {
                    onSuccess: () => setEditDigitalBook(null),
                  });
                }}
                disabled={updateDigitalBook.isPending}
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
