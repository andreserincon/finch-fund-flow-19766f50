import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock, FileText, BookOpen } from 'lucide-react';
import { useTransferRequests } from '@/hooks/useTransferRequests';
import { useDigitalBooks } from '@/hooks/useDigitalBooks';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

export function PendingRequestsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { requests, isLoading, reviewRequest } = useTransferRequests();
  const { digitalBooks, isLoading: digitalLoading, approveBook, rejectBook } = useDigitalBooks('maestro');

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  const pendingDigital = digitalBooks.filter((b) => !b.is_approved);

  const totalPending = pending.length + pendingDigital.length;

  const handleReview = (id: string, status: 'approved' | 'rejected') => {
    if (!user?.id) return;
    reviewRequest.mutate({ id, status, reviewed_by: user.id });
  };

  const handleApproveDigital = (id: string) => {
    if (!user?.id) return;
    approveBook.mutate({ id, approvedBy: user.id });
  };

  const handleRejectDigital = (book: typeof digitalBooks[0]) => {
    rejectBook.mutate(book);
  };

  if (isLoading || digitalLoading) return <p className="text-muted-foreground p-4">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('library.pendingRequests')}
            {totalPending > 0 && (
              <Badge variant="destructive">{totalPending}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalPending === 0 ? (
            <p className="text-muted-foreground text-sm">{t('library.noPending')}</p>
          ) : (
            <div className="space-y-3">
              {/* Pending digital book uploads */}
              {pendingDigital.map((book) => (
                <div key={`digital-${book.id}`} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-destructive/70 shrink-0" />
                      <p className="font-medium text-sm truncate">{book.title}</p>
                      <Badge variant="secondary" className="text-xs shrink-0">PDF</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {book.author} · {t(`library.grades.${book.grade_level}`)}
                    </p>
                    {book.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{book.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(book.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleApproveDigital(book.id)}
                      disabled={approveBook.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRejectDigital(book)}
                      disabled={rejectBook.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Pending transfer requests */}
              {pending.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary/70 shrink-0" />
                      <p className="font-medium text-sm truncate">{req.book_title}</p>
                    </div>
                    {req.current_holder_name && (
                      <p className="text-xs text-muted-foreground">
                        {t('library.currentHolder')}: {req.current_holder_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t('library.newHolder')}: {req.new_holder_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleReview(req.id, 'approved')}
                      disabled={reviewRequest.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReview(req.id, 'rejected')}
                      disabled={reviewRequest.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {reviewed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('library.reviewedRequests')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reviewed.slice(0, 10).map((req) => (
                <div key={req.id} className="flex items-center gap-3 text-sm border-b pb-2 last:border-0">
                  <Badge variant={req.status === 'approved' ? 'default' : 'destructive'}>
                    {req.status === 'approved' ? t('library.approved') : t('library.rejected')}
                  </Badge>
                  <span className="flex-1 truncate">{req.book_title}</span>
                  <span className="text-xs text-muted-foreground">{req.new_holder_name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
