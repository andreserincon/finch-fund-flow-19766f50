import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, User, Calendar, QrCode, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTransferRequests } from '@/hooks/useTransferRequests';
import { useAuth } from '@/hooks/useAuth';
import { BookQRLabel } from './BookQRLabel';
import type { Book } from '@/lib/library-types';

interface BookDetailDrawerProps {
  book: Book;
  open: boolean;
  onClose: () => void;
  isBibliotecario: boolean;
}

export function BookDetailDrawer({ book, open, onClose, isBibliotecario }: BookDetailDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createRequest } = useTransferRequests();
  const [showQR, setShowQR] = useState(false);

  // Get the current user's member_id from their profile
  const { data: userMemberId } = useQuery({
    queryKey: ['user-member-id', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('member_id')
        .eq('id', user.id)
        .maybeSingle();
      return data?.member_id ?? null;
    },
    enabled: !!user?.id,
  });

  const handleRequestTransfer = () => {
    if (!user?.id || !userMemberId) return;
    createRequest.mutate(
      { book_id: book.id, requested_by: user.id, new_holder_id: userMemberId },
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{book.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <p className="text-sm"><span className="font-medium">{t('library.author')}:</span> {book.author}</p>
            {book.edition && <p className="text-sm"><span className="font-medium">{t('library.edition')}:</span> {book.edition}</p>}
            <p className="text-sm"><span className="font-medium">{t('library.copyNumber')}:</span> {book.copy_number || 1}</p>
            {book.publication_date && <p className="text-sm"><span className="font-medium">{t('library.pubDate')}:</span> {format(new Date(book.publication_date), 'dd/MM/yyyy')}</p>}
            {book.description && <p className="text-sm text-muted-foreground mt-2">{book.description}</p>}
          </div>

          <div className="flex gap-2">
            <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
            <Badge variant={book.status === 'available' ? 'default' : 'secondary'}>
              {book.status === 'available' ? t('library.available') : t('library.onLoan')}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-sm bg-muted/30 rounded-lg p-2">
            {book.owner_id ? <User className="h-4 w-4 text-muted-foreground" /> : <Building2 className="h-4 w-4 text-muted-foreground" />}
            <span className="font-medium">{t('library.owner')}:</span>
            <span>{book.owner_name || t('library.ownerLodge')}</span>
          </div>

          {book.status === 'on_loan' && book.holder_name && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                <span className="font-medium">{book.holder_name}</span>
              </div>
              {book.held_since && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{t('library.heldSince')} {format(new Date(book.held_since), 'dd/MM/yyyy')}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleRequestTransfer}
              disabled={!userMemberId || createRequest.isPending}
            >
              <ArrowRightLeft className="h-4 w-4 mr-1" />
              {createRequest.isPending ? t('common.processing') : t('library.requestTransfer')}
            </Button>
            {isBibliotecario && (
              <Button variant="outline" onClick={() => setShowQR(!showQR)}>
                <QrCode className="h-4 w-4" />
              </Button>
            )}
          </div>

          {!userMemberId && (
            <p className="text-xs text-muted-foreground">
              {t('library.noMemberLinked', 'Necesitás tener un miembro asociado para solicitar libros.')}
            </p>
          )}

          {showQR && <BookQRLabel book={book} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}