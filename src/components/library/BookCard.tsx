import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, User, Building2 } from 'lucide-react';
import type { Book } from '@/lib/library-types';
import { format } from 'date-fns';

const gradeColors: Record<string, string> = {
  aprendiz: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  companero: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  maestro: 'bg-red-500/10 text-red-700 border-red-500/30',
};

interface BookCardProps {
  book: Book;
  onClick: () => void;
}

export function BookCard({ book, onClick }: BookCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-border/60 hover:border-primary/30"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{book.title}</h3>
            <p className="text-sm text-muted-foreground truncate">{book.author}</p>
          </div>
          <BookOpen className="h-5 w-5 text-muted-foreground/40 shrink-0" />
        </div>

        {(book.edition || book.copy_number > 1) && (
          <p className="text-xs text-muted-foreground">
            {book.edition}{book.edition && book.copy_number > 1 ? ' · ' : ''}{book.copy_number > 1 ? `${t('library.copyNumber')} ${book.copy_number}` : ''}
          </p>
        )}

        {book.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{book.description}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={gradeColors[book.grade_level]}>
            {t(`library.grades.${book.grade_level}`)}
          </Badge>
          <Badge variant={book.status === 'available' ? 'default' : 'secondary'}>
            {book.status === 'available' ? t('library.available') : t('library.onLoan')}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {book.owner_id ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
          <span>{book.owner_name || t('library.ownerLodge')}</span>
        </div>
        {book.status === 'on_loan' && book.holder_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
            <User className="h-3 w-3" />
            <span>{book.holder_name}</span>
            {book.held_since && (
              <span className="ml-auto">{format(new Date(book.held_since), 'dd/MM/yyyy')}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
