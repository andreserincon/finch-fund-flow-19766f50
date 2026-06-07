/**
 * @file PaymentReminders.tsx
 * @description Treasury page at /recordatorios. Lists every member who requires
 *   attention with a ready-to-send reminder message (capitas + event cuotas,
 *   built by src/lib/reminderDetail) and a "Enviar por WhatsApp" button that
 *   opens WhatsApp (web or app) with the message prefilled (wa.me click-to-chat).
 *   When a member has no WhatsApp number yet, the card lets the treasurer add it
 *   inline. The treasurer reviews and sends manually from their own WhatsApp.
 *   No Twilio.
 */

import { useMemo, useState } from 'react';
import { MessageSquare, Copy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useMemberFeeTypeHistory } from '@/hooks/useMemberFeeTypeHistory';
import { useMemberEventTotals } from '@/hooks/useMemberEventTotals';
import { useEventParticipations } from '@/hooks/useEventParticipations';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { getAttentionMembers } from '@/lib/attention';
import {
  capitaLines, eventLines, joinDetail, buildReminderMessage, firstName, whatsappLink,
} from '@/lib/reminderDetail';
import { TableSkeleton } from '@/components/ui/loading';
import { toast } from 'sonner';
import type { MemberBalance } from '@/lib/types';

interface ReminderItem {
  member: MemberBalance;
  message: string;
  link: string | null;
  hasDetail: boolean;
}

export default function PaymentReminders() {
  const { members, memberBalances, isLoading: membersLoading } = useMembers();
  const { monthlyFees, currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const { getFeeTypeForMonth, isLoading: historyLoading } = useMemberFeeTypeHistory();
  const { eventTotals, isLoading: eventsLoading } = useMemberEventTotals();
  const { participations, isLoading: partsLoading } = useEventParticipations();
  const isMobile = useIsMobile();

  const isLoading = membersLoading || feesLoading || historyLoading || eventsLoading || partsLoading;

  // WhatsApp number is read from the members table (not the member_balances
  // view), so it works regardless of whether the view exposes the column.
  const whatsappById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const mm of members) map.set(mm.id, mm.whatsapp_number ?? null);
    return map;
  }, [members]);

  const reminders = useMemo<ReminderItem[]>(() => {
    const today = new Date();
    const attention = getAttentionMembers(memberBalances, currentMonthFees, eventTotals);
    return attention.map((m) => {
      const eventPaid = eventTotals.paid[m.member_id] || 0;
      const capitaPaid = m.total_paid - eventPaid;
      const cLines = capitaLines(m, monthlyFees, getFeeTypeForMonth, capitaPaid, today);
      const myParts = participations.filter((p) => p.member_id === m.member_id);
      const eLines = eventLines(myParts, today);
      const detail = joinDetail([...cLines, ...eLines]);
      const detailText = detail || 'un saldo pendiente en tesorería';
      const message = buildReminderMessage(firstName(m.full_name), detailText);
      return {
        member: m,
        message,
        link: whatsappLink(whatsappById.get(m.member_id), message, !isMobile),
        hasDetail: cLines.length + eLines.length > 0,
      };
    });
  }, [memberBalances, currentMonthFees, eventTotals, monthlyFees, getFeeTypeForMonth, participations, whatsappById, isMobile]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display">Recordatorios</h1>
        <p className="text-muted-foreground">
          Un mensaje listo por cada socio que requiere atención. Revisalo y envialo por WhatsApp con un clic.
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={2} />
      ) : reminders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 text-success/40" />
            Todos los socios están al día.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{reminders.length} socio(s) con saldo pendiente.</p>
          {reminders.map((r) => (
            <ReminderCard key={r.member.member_id} item={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderCard({ item }: { item: ReminderItem }) {
  const { member, message, link, hasDetail } = item;
  const { updateMember } = useMembers();
  const { displayName } = useHiddenMode();
  const [number, setNumber] = useState('');

  const copy = () => {
    navigator.clipboard.writeText(message).then(
      () => toast.success('Mensaje copiado'),
      () => toast.error('No se pudo copiar'),
    );
  };

  const saveNumber = async () => {
    const value = number.trim();
    if (!/^\+[0-9]{8,15}$/.test(value)) {
      toast.error('Usá el formato internacional, ej: +5491155551234');
      return;
    }
    await updateMember.mutateAsync({ id: member.member_id, whatsapp_number: value });
    setNumber('');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">
            {displayName(member.full_name, member.phone_number)}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="press" onClick={copy}>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar
            </Button>
            {link && (
              <Button size="sm" className="press" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <MessageSquare className="mr-1.5 h-4 w-4" /> Enviar por WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90 bg-muted/30 rounded-md p-3 border">
          {message}
        </pre>

        {!link && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs text-warning shrink-0">Falta el número de WhatsApp:</span>
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+5491155551234"
              className="h-9 sm:w-56"
              onKeyDown={(e) => { if (e.key === 'Enter') saveNumber(); }}
            />
            <Button size="sm" onClick={saveNumber} disabled={!number.trim() || updateMember.isPending}>
              {updateMember.isPending ? 'Guardando...' : 'Guardar número'}
            </Button>
          </div>
        )}

        {!hasDetail && (
          <p className="mt-2 text-xs text-warning">
            No se pudo desglosar la deuda en cuotas para este socio; revisá su detalle a mano antes de enviar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
