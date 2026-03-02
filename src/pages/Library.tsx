import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, ClipboardList, Search, Filter, Settings, User, FileText, Download, Upload, ScanLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useBooks } from '@/hooks/useBooks';
import { useDigitalBooks, type DigitalBook } from '@/hooks/useDigitalBooks';
import { useIsBibliotecario } from '@/hooks/useIsBibliotecario';
import { useUserGrade } from '@/hooks/useUserGrade';
import { useAuth } from '@/hooks/useAuth';
import { BookCard } from '@/components/library/BookCard';
import { AddBookDialog } from '@/components/library/AddBookDialog';
import { BookDetailDrawer } from '@/components/library/BookDetailDrawer';
import { DigitalBookDetailDrawer } from '@/components/library/DigitalBookDetailDrawer';
import { PendingRequestsPanel } from '@/components/library/PendingRequestsPanel';
import { BookManagementTable } from '@/components/library/BookManagementTable';
import { MyBooksPanel } from '@/components/library/MyBooksPanel';
import { DigitalLibraryPanel } from '@/components/library/DigitalLibraryPanel';
import { UploadDigitalBookDialog } from '@/components/library/UploadDigitalBookDialog';
import { QRScannerDialog } from '@/components/library/QRScannerDialog';
import { toast } from 'sonner';
import type { Book } from '@/lib/library-types';
import { format } from 'date-fns';

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

type BrowseItem =
  | { type: 'physical'; data: Book }
  | { type: 'digital'; data: DigitalBook };

// Library page component
export default function Library() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { grade, isLoading: gradeLoading } = useUserGrade();
  const { isBibliotecario, isLoading: biblioLoading } = useIsBibliotecario();
  const { books, isLoading } = useBooks(isBibliotecario ? 'maestro' : grade, !biblioLoading && !gradeLoading);
  const { digitalBooks, isLoading: digitalLoading, getDownloadUrl } = useDigitalBooks(
    isBibliotecario ? 'maestro' : grade
  );

  const activeTab = searchParams.get('tab') || 'browse';

  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedDigitalBook, setSelectedDigitalBook] = useState<DigitalBook | null>(null);
  const [showAddBook, setShowAddBook] = useState(false);
  const [showUploadDigital, setShowUploadDigital] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleQRScan = (bookId: string) => {
    const found = books.find((b) => b.id === bookId);
    if (found) {
      setSelectedBook(found);
    } else {
      toast.error(t('library.bookNotFound', 'Libro no encontrado'));
    }
  };

  // Handle ?book=<id> from QR scan
  const bookIdFromQR = searchParams.get('book');
  useEffect(() => {
    if (bookIdFromQR && !isLoading && books.length > 0) {
      const found = books.find((b) => b.id === bookIdFromQR);
      if (found) {
        setSelectedBook(found);
        searchParams.delete('book');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [bookIdFromQR, isLoading, books]);

  useEffect(() => {
    if (activeTab === 'add') {
      setShowAddBook(true);
      setSearchParams({});
    }
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    if (value === 'browse') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: value });
    }
  };

  // Merge physical + approved digital books for browse tab
  // Digital books only visible in browse for bibliotecario/admin
  const browseItems: BrowseItem[] = [
    ...books
      .filter((b) => b.is_approved)
      .map((b) => ({ type: 'physical' as const, data: b })),
    ...digitalBooks
      .filter((b) => b.is_approved)
      .map((b) => ({ type: 'digital' as const, data: b })),
  ];

  const filtered = browseItems.filter((item) => {
    const d = item.data;
    const matchSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.author.toLowerCase().includes(search.toLowerCase());
    const matchGrade = gradeFilter === 'all' || d.grade_level === gradeFilter;
    const matchType = typeFilter === 'all' || item.type === typeFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (item.type === 'physical' && (item.data as Book).status === statusFilter) ||
      (item.type === 'digital' && statusFilter === 'available');
    return matchSearch && matchGrade && matchType && matchStatus;
  });

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

  const browseLoading = isLoading || digitalLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            {t('library.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('library.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {isBibliotecario && (
            <Button variant="outline" onClick={() => setShowUploadDigital(true)} className="gap-2">
              <Upload className="h-4 w-4" />
              {t('digitalLibrary.uploadBook')}
            </Button>
          )}
          <Button onClick={() => setShowAddBook(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('library.addBook')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="browse">
            <Search className="h-4 w-4 mr-1" />
            {t('library.browse')}
          </TabsTrigger>
          {isBibliotecario && (
            <TabsTrigger value="digital">
              <FileText className="h-4 w-4 mr-1" />
              {t('digitalLibrary.title')}
            </TabsTrigger>
          )}
          <TabsTrigger value="mybooks">
            <User className="h-4 w-4 mr-1" />
            {t('library.myBooks')}
          </TabsTrigger>
          {isBibliotecario && (
            <>
              <TabsTrigger value="manage">
                <Settings className="h-4 w-4 mr-1" />
                {t('library.manage')}
              </TabsTrigger>
              <TabsTrigger value="requests">
                <ClipboardList className="h-4 w-4 mr-1" />
                {t('library.requests')}
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
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
            <Button variant="outline" className="sm:hidden gap-2" onClick={() => setShowScanner(true)}>
              <ScanLine className="h-4 w-4" />
              {t('library.scanQR', 'Escanear QR')}
            </Button>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('library.allTypes')}</SelectItem>
                <SelectItem value="physical">{t('library.physical')}</SelectItem>
                <SelectItem value="digital">{t('library.digital')}</SelectItem>
              </SelectContent>
            </Select>
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('library.allStatus')}</SelectItem>
                <SelectItem value="available">{t('library.available')}</SelectItem>
                <SelectItem value="on_loan">{t('library.onLoan')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {browseLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>{t('library.noBooks')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((item) =>
                item.type === 'physical' ? (
                  <BookCard
                    key={`p-${item.data.id}`}
                    book={item.data as Book}
                    onClick={() => setSelectedBook(item.data as Book)}
                  />
                ) : (
                  <Card
                    key={`d-${item.data.id}`}
                    className="cursor-pointer hover:shadow-md transition-shadow border-border/60 hover:border-primary/30"
                    onClick={() => setSelectedDigitalBook(item.data as DigitalBook)}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">
                            {item.data.title}
                          </h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {item.data.author}
                          </p>
                        </div>
                        <FileText className="h-5 w-5 text-red-500/60 shrink-0" />
                      </div>

                      {item.data.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.data.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={gradeColors[item.data.grade_level]}>
                          {t(`library.grades.${item.data.grade_level}`)}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <FileText className="h-3 w-3" />
                          PDF
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize((item.data as DigitalBook).file_size_bytes)}
                        </span>
                      </div>

                      <Button variant="outline" size="sm" className="w-full gap-1">
                        <Download className="h-4 w-4" />
                        {t('digitalLibrary.download')}
                      </Button>
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          )}
        </TabsContent>

        {isBibliotecario && (
          <TabsContent value="digital" className="space-y-4">
            <DigitalLibraryPanel />
          </TabsContent>
        )}

        <TabsContent value="mybooks" className="space-y-4">
          <MyBooksPanel onSelectBook={setSelectedBook} />
        </TabsContent>

        {isBibliotecario && (
          <TabsContent value="manage">
            <BookManagementTable />
          </TabsContent>
        )}

        {isBibliotecario && (
          <TabsContent value="requests">
            <PendingRequestsPanel />
          </TabsContent>
        )}
      </Tabs>

      {selectedBook && (
        <BookDetailDrawer
          book={selectedBook}
          open={!!selectedBook}
          onClose={() => setSelectedBook(null)}
          isBibliotecario={isBibliotecario}
        />
      )}

      {selectedDigitalBook && (
        <DigitalBookDetailDrawer
          book={selectedDigitalBook}
          open={!!selectedDigitalBook}
          onClose={() => setSelectedDigitalBook(null)}
        />
      )}

      {showAddBook && (
        <AddBookDialog open={showAddBook} onClose={() => setShowAddBook(false)} />
      )}

      {showUploadDigital && (
        <UploadDigitalBookDialog open={showUploadDigital} onClose={() => setShowUploadDigital(false)} />
      )}

      <QRScannerDialog open={showScanner} onClose={() => setShowScanner(false)} onScan={handleQRScan} />
    </div>
  );
}
