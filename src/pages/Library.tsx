import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, ClipboardList, Search, Filter, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBooks } from '@/hooks/useBooks';
import { useIsBibliotecario } from '@/hooks/useIsBibliotecario';
import { useUserGrade } from '@/hooks/useUserGrade';
import { BookCard } from '@/components/library/BookCard';
import { AddBookDialog } from '@/components/library/AddBookDialog';
import { BookDetailDrawer } from '@/components/library/BookDetailDrawer';
import { PendingRequestsPanel } from '@/components/library/PendingRequestsPanel';
import { BookManagementTable } from '@/components/library/BookManagementTable';
import type { Book } from '@/lib/library-types';

export default function Library() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { grade } = useUserGrade();
  const { isBibliotecario, isLoading: biblioLoading } = useIsBibliotecario();
  const { books, isLoading } = useBooks(isBibliotecario ? 'maestro' : grade);

  const activeTab = searchParams.get('tab') || 'browse';

  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showAddBook, setShowAddBook] = useState(false);

  const handleTabChange = (value: string) => {
    if (value === 'browse') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: value });
    }
  };

  const filtered = books.filter((b) => {
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());
    const matchGrade = gradeFilter === 'all' || b.grade_level === gradeFilter;
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchGrade && matchStatus;
  });

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
        {isBibliotecario && (
          <Button onClick={() => setShowAddBook(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('library.addBook')}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="browse">
            <Search className="h-4 w-4 mr-1" />
            {t('library.browse')}
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
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-4 w-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('library.allGrades')}</SelectItem>
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

          {isLoading ? (
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
              {filtered.map((book) => (
                <BookCard key={book.id} book={book} onClick={() => setSelectedBook(book)} />
              ))}
            </div>
          )}
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

      {showAddBook && (
        <AddBookDialog open={showAddBook} onClose={() => setShowAddBook(false)} />
      )}
    </div>
  );
}
