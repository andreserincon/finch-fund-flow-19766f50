import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock } from 'lucide-react';
import { useTransferRequests } from '@/hooks/useTransferRequests';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

export function PendingRequestsPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { requests, isLoading, reviewRequest } = useTransferRequests();

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  const handleReview = (id: string, status: 'approved' | 'rejected') => {
    if (!user?.id) return;
    reviewRequest.mutate({ id, status, reviewed_by: user.id });
  };

  if (isLoading) return <p className="text-muted-foreground p-4">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('library.pendingRequests')}
            {pending.length > 0 && (
              <Badge variant="destructive">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('library.noPending')}</p>
          ) : (
            <div className="space-y-3">
              {pending.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{req.book_title}</p>
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
