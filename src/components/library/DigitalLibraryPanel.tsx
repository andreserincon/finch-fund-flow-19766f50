import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, Search, Filter, Upload, Check, X, Clock, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDigitalBooks, type DigitalBook } from '@/hooks/useDigitalBooks';
import { useAuth } from '@/hooks/useAuth';
import { useUserGrade } from '@/hooks/useUserGrade';
import { useIsBibliotecario } from '@/hooks/useIsBibliotecario';
import { UploadDigitalBookDialog } from './UploadDigitalBookDialog';
import { DigitalBookDetailDrawer } from './DigitalBookDetailDrawer';
import { toast } from 'sonner';

const gradeColors: Record<string, string> = {
  aprendiz: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  companero: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  maestro: 'bg-red-500/10 text-red-700 border-red-500/30',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DigitalLibraryPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { grade } = useUserGrade();
  const { isBibliotecario } = useIsBibliotecario();
  const { digitalBooks, isLoading, approveBook, rejectBook, getDownloadUrl } = useDigitalBooks(
    isBibliotecario ? 'maestro' : grade
  );

  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [selectedBook, setSelectedBook] = useState<DigitalBook | null>(null);

  const approvedBooks = digitalBooks.filter((b) => b.is_approved);
  const pendingBooks = digitalBooks.filter((b) => !b.is_approved);

  const filtered = (showPending ? pendingBooks : approvedBooks).filter((b) => {
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());
    const matchGrade = gradeFilter === 'all' || b.grade_level === gradeFilter;
    return matchSearch && matchGrade;
  });

  const handleDownload = async (book: DigitalBook) => {
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

  const handleApprove = (id: string) => {
    if (!user?.id) return;
    approveBook.mutate({ id, approvedBy: user.id });
  };

  const handleReject = (book: DigitalBook) => {
    rejectBook.mutate(book);
  };

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          {isBibliotecario && (
            <Button
              variant={showPending ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowPending(!showPending)}
              className="gap-1"
            >
              <Clock className="h-4 w-4" />
              {t('digitalLibrary.pending')}
              {pendingBooks.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                  {pendingBooks.length}
                </Badge>
              )}
            </Button>
          )}
        </div>
        <Button onClick={() => setShowUpload(true)} size="sm" className="gap-1">
          <Upload className="h-4 w-4" />
          {t('digitalLibrary.uploadBook')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('library.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('library.allGrades')}</SelectItem>
            <SelectItem value="profano">{t('library.grades.profano')}</SelectItem>
            <SelectItem value="aprendiz">{t('library.grades.aprendiz')}</SelectItem>
            <SelectItem value="companero">{t('library.grades.companero')}</SelectItem>
            <SelectItem value="maestro">{t('library.grades.maestro')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Books grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>{showPending ? t('digitalLibrary.noPending') : t('digitalLibrary.noBooks')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((book) => (
            <Card
              key={book.id}
              className="border-border/60 hover:border-primary/30 transition-colors cursor-pointer hover:shadow-md"
              onClick={() => book.is_approved && setSelectedBook(book)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{book.title}</h3>
                    <p className="text-sm text-muted-foreground truncate">{book.author}</p>
                  </div>
                  <FileText className="h-5 w-5 text-red-500/60 shrink-0" />
                </div>

                {book.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{book.description}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={gradeColors[book.grade_level]}>
                    {t(`library.grades.${book.grade_level}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    PDF • {formatFileSize(book.file_size_bytes)}
                  </span>
                  {!book.is_approved && (
                    <Badge variant="secondary" className="gap-1">
                      <Shield className="h-3 w-3" />
                      {t('digitalLibrary.pendingApproval')}
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {book.is_approved && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => handleDownload(book)}
                    >
                      <Download className="h-4 w-4" />
                      {t('digitalLibrary.download')}
                    </Button>
                  )}
                  {showPending && isBibliotecario && !book.is_approved && (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => handleApprove(book.id)}
                        disabled={approveBook.isPending}
                      >
                        <Check className="h-4 w-4" />
                        {t('digitalLibrary.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        onClick={() => handleReject(book)}
                        disabled={rejectBook.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showUpload && (
        <UploadDigitalBookDialog open={showUpload} onClose={() => setShowUpload(false)} />
      )}

      {selectedBook && (
        <DigitalBookDetailDrawer
          book={selectedBook}
          open={!!selectedBook}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </div>
  );
}
