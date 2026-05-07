/**
 * @file PaymentReminders.tsx
 * @description Treasury page at /recordatorios. Shows the queue of
 *   overdue WhatsApp reminders for a given period (defaults to current
 *   month), grouped by status. Treasurer can edit each draft, send
 *   individually, send all pending, or dismiss.
 */

import { useMemo, useState } from 'react';
import { Send, RefreshCw, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePaymentReminders } from '@/hooks/usePaymentReminders';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import { PaymentReminder, REMINDER_STATUS_LABELS, ReminderStatus } from '@/lib/types';

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const STATUS_FILTERS: { key: ReminderStatus | 'all'; label: string }[] = [
  { key: 'pending_review', label: 'Pendientes' },
  { key: 'sent', label: 'Enviados' },
  { key: 'failed', label: 'Fallidos' },
  { key: 'dismissed', label: 'Descartados' },
  { key: 'all', label: 'Todos' },
];

function statusBadgeVariant(status: ReminderStatus): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'sent':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'pending_review':
      return 'secondary';
    case 'approved':
      return 'secondary';
    case 'dismissed':
    default:
      return 'outline';
  }
}

function ReminderRow({
  reminder,
  canEdit,
  onSend,
  onDismiss,
  onUpdateDraft,
  isSending,
}: {
  reminder: PaymentReminder;
  canEdit: boolean;
  onSend: (id: string) => void;
  onDismiss: (id: string) => void;
  onUpdateDraft: (id: string, draft: string) => void;
  isSending: boolean;
}) {
  const [draft, setDraft] = useState(reminder.draft_message);
  const [editing, setEditing] = useState(false);

  const isPending = reminder.status === 'pending_review';
  const phone = reminder.whatsapp_number || reminder.member?.whatsapp_number || '—';

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{reminder.member?.full_name || '—'}</span>
          <span className="text-xs text-muted-foreground font-mono">{phone}</span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(Number(reminder.amount_owed))}
      </TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant(reminder.status)}>
          {REMINDER_STATUS_LABELS[reminder.status]}
        </Badge>
        {reminder.failure_reason && (
          <p className="text-xs text-destructive mt-1">{reminder.failure_reason}</p>
        )}
        {reminder.sent_at && (
          <p className="text-xs text-muted-foreground mt-1">
            Enviado: {parseLocalDate(reminder.sent_at.slice(0, 10)).toLocaleDateString('es-AR')}
          </p>
        )}
      </TableCell>
      <TableCell className="min-w-[280px]">
        {isPending && canEdit ? (
          editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                className="text-xs font-mono"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onUpdateDraft(reminder.id, draft);
                    setEditing(false);
                  }}
                >
                  Guardar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft(reminder.draft_message);
                    setEditing(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-left text-xs whitespace-pre-wrap font-mono hover:underline"
              onClick={() => setEditing(true)}
            >
              {reminder.draft_message}
            </button>
          )
        ) : (
          <p className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
            {reminder.final_message || reminder.draft_message}
          </p>
        )}
      </TableCell>
      <TableCell className="text-right">
        {isPending && canEdit && (
          <div className="flex gap-1 justify-end">
            <Button
              size="sm"
              onClick={() => onSend(reminder.id)}
              disabled={isSending || !reminder.whatsapp_number}
              title={!reminder.whatsapp_number ? 'Falta número de WhatsApp' : 'Enviar por WhatsApp'}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(reminder.id)} title="Descartar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function PaymentReminders() {
  const today = new Date();
  const [period, setPeriod] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | 'all'>('pending_review');
  const { isAdmin } = useIsAdmin();

  const {
    reminders,
    isLoading,
    updateDraft,
    dismissReminder,
    sendReminders,
    buildQueueNow,
  } = usePaymentReminders(period);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? reminders : reminders.filter((r) => r.status === statusFilter)),
    [reminders, statusFilter]
  );

  const pendingWithNumbers = useMemo(
    () => reminders.filter((r) => r.status === 'pending_review' && !!r.whatsapp_number),
    [reminders]
  );

  const yearOptions = useMemo(() => {
    const current = today.getFullYear();
    return [current - 1, current, current + 1];
  }, [today]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recordatorios</h1>
          <p className="text-muted-foreground">
            Cola de recordatorios automáticos por WhatsApp para miembros con pagos atrasados.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => buildQueueNow.mutate()}
              disabled={buildQueueNow.isPending}
            >
              {buildQueueNow.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reconstruir cola
            </Button>
            <Button
              onClick={() => sendReminders.mutate(pendingWithNumbers.map((r) => r.id))}
              disabled={pendingWithNumbers.length === 0 || sendReminders.isPending}
            >
              {sendReminders.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar todos los pendientes ({pendingWithNumbers.length})
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>{MONTH_NAMES_ES[period.month - 1]} {period.year}</CardTitle>
            <CardDescription>{reminders.length} recordatorio(s) en este período</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={period.month}
              onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {MONTH_NAMES_ES.map((label, idx) => (
                <option key={idx} value={idx + 1}>{label}</option>
              ))}
            </select>
            <select
              value={period.year}
              onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReminderStatus | 'all')}>
            <TabsList className="grid grid-cols-5 w-full max-w-2xl mb-4">
              {STATUS_FILTERS.map((s) => (
                <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay recordatorios en este filtro.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miembro</TableHead>
                  <TableHead className="text-right">Adeudado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    canEdit={isAdmin}
                    isSending={sendReminders.isPending}
                    onSend={(id) => sendReminders.mutate([id])}
                    onDismiss={(id) => dismissReminder.mutate(id)}
                    onUpdateDraft={(id, draft) => updateDraft.mutate({ id, draft_message: draft })}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
