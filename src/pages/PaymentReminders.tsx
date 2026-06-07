/**
 * @file PaymentReminders.tsx
 * @description Treasury page at /recordatorios. Lists every member who requires
 *   attention with a ready-to-send reminder message (capitas + event cuotas,
 *   built by src/lib/reminderDetail) and a "Enviar por WhatsApp" button that
 *   opens WhatsApp (web or app) with the message prefilled (wa.me click-to-chat).
 *   The treasurer reviews and sends manually from their own WhatsApp. No Twilio.
 */

import { useMemo } from 'react';
import { MessageSquare, Copy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useMemberFeeTypeHistory } from '@/hooks/useMemberFeeTypeHistory';
import { useMemberEventTotals } from '@/hooks/useMemberEventTotals';
import { useEventParticipations } from '@/hooks/useEventParticipations';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
import { getAttentionMembers } from '@/lib/attention';
import {
  capitaLines, eventLines, joinDetail, buildReminderMessage, firstName, whatsappLink,
} from '@/lib/reminderDetail';
import { TableSkeleton } from '@/components/ui/loading';
import { toast } from 'sonner';

export default function PaymentReminders() {
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { monthlyFees, currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const { getFeeTypeForMonth, isLoading: historyLoading } = useMemberFeeTypeHistory();
  const { eventTotals, isLoading: eventsLoading } = useMemberEventTotals();
  const { participations, isLoading: partsLoading } = useEventParticipations();
  const { displayName } = useHiddenMode();

  const isLoading = membersLoading || feesLoading || historyLoading || eventsLoading || partsLoading;

  const reminders = useMemo(() => {
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
        link: whatsappLink(m.whatsapp_number, message),
        hasDetail: cLines.length + eLines.length > 0,
      };
    });
  }, [memberBalances, currentMonthFees, eventTotals, monthlyFees, getFeeTypeForMonth, participations]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Mensaje copiado'),
      () => toast.error('No se pudo copiar'),
    );
  };

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
          {reminders.map(({ member, message, link, hasDetail }) => (
            <Card key={member.member_id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base">
                    {displayName(member.full_name, member.phone_number)}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="press" onClick={() => copy(message)}>
                      <Copy className="mr-1.5 h-4 w-4" /> Copiar
                    </Button>
                    {link ? (
                      <Button size="sm" className="press" asChild>
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          <MessageSquare className="mr-1.5 h-4 w-4" /> Enviar por WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" disabled title="Este socio no tiene número de WhatsApp cargado">
                        <MessageSquare className="mr-1.5 h-4 w-4" /> Sin WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90 bg-muted/30 rounded-md p-3 border">
                  {message}
                </pre>
                {!hasDetail && (
                  <p className="mt-2 text-xs text-warning">
                    No se pudo desglosar la deuda en cuotas para este socio; revisá su detalle a mano antes de enviar.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
