import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowRightLeft, User, Calendar, QrCode } from 'lucide-react';
import { format } from 'date-fns';
import { useMembers } from '@/hooks/useMembers';
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
  const { members } = useMembers();
  const { createRequest } = useTransferRequests();
  const [newHolderId, setNewHolderId] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleSubmitTransfer = () => {
    if (!user?.id || !newHolderId) return;
    createRequest.mutate(
      { book_id: book.id, requested_by: user.id, new_holder_id: newHolderId },
      { onSuccess: () => { setShowTransfer(false); setNewHolderId(''); } }
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
            {book.publication_date && <p className="text-sm"><span className="font-medium">{t('library.pubDate')}:</span> {format(new Date(book.publication_date), 'dd/MM/yyyy')}</p>}
            {book.description && <p className="text-sm text-muted-foreground mt-2">{book.description}</p>}
          </div>

          <div className="flex gap-2">
            <Badge variant="outline">{t(`library.grades.${book.grade_level}`)}</Badge>
            <Badge variant={book.status === 'available' ? 'default' : 'secondary'}>
              {book.status === 'available' ? t('library.available') : t('library.onLoan')}
            </Badge>
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
            <Button variant="outline" className="flex-1" onClick={() => setShowTransfer(!showTransfer)}>
              <ArrowRightLeft className="h-4 w-4 mr-1" />
              {t('library.requestTransfer')}
            </Button>
            {isBibliotecario && (
              <Button variant="outline" onClick={() => setShowQR(!showQR)}>
                <QrCode className="h-4 w-4" />
              </Button>
            )}
          </div>

          {showTransfer && (
            <div className="space-y-3 border rounded-lg p-3">
              <Label>{t('library.newHolder')}</Label>
              <Select value={newHolderId} onValueChange={setNewHolderId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('library.selectMember')} />
                </SelectTrigger>
                <SelectContent>
                  {(members || []).filter(m => m.is_active).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSubmitTransfer}
                disabled={!newHolderId || createRequest.isPending}
                className="w-full"
              >
                {createRequest.isPending ? t('common.processing') : t('library.submitRequest')}
              </Button>
            </div>
          )}

          {showQR && <BookQRLabel book={book} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
