/**
 * @file MyPayments.tsx
 * @description Member-facing read-only payment ledger at /mis-pagos. Answers
 *   "did my payment register?": the logged-in member's own transactions, grouped
 *   by month, newest first, with a paid status chip and a per-month total. No
 *   edit or delete. Data is scoped to the member's own member_id (and must also
 *   be scoped server-side via RLS, which is the real boundary).
 */
import { useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/lib/types';

export default function MyPayments() {
  const { profile } = useAuth();
  const userMemberId = profile?.member_id;
  const { transactions, isLoading } = useTransactions();

  const myPayments = useMemo(
    () =>
      (transactions ?? []).filter(
        (t) => t.member_id && t.member_id === userMemberId && t.transaction_type === 'income',
      ),
    [transactions, userMemberId],
  );

  // Group by YYYY-MM, newest month first.
  const months = useMemo(() => {
    const map = new Map<string, typeof myPayments>();
    for (const t of myPayments) {
      const key = t.transaction_date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({
        key,
        label: format(parseLocalDate(`${key}-01`), 'MMMM yyyy', { locale: es }),
        rows: [...rows].sort(
          (a, b) => parseLocalDate(b.transaction_date).getTime() - parseLocalDate(a.transaction_date).getTime(),
        ),
        total: rows.reduce((s, r) => s + Number(r.amount), 0),
      }));
  }, [myPayments]);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground font-display">Mis pagos</h1>
        <div className="rule-gold mt-2" />
        <p className="text-sm text-muted-foreground mt-2">Tus pagos registrados, del mas reciente al mas antiguo</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !userMemberId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Tu usuario aun no esta vinculado a una ficha de miembro. Escribile al Tesorero para vincularlo.
          </CardContent>
        </Card>
      ) : months.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Todavia no tenes pagos registrados. Cuando el Tesorero registre un pago tuyo, aparecera aca.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {months.map((m) => (
            <Card key={m.key}>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-display capitalize">{m.label}</CardTitle>
                <span className="font-mono tabular-nums text-sm font-semibold text-success">{formatCurrency(m.total)}</span>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-border/50">
                  {m.rows.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{CATEGORY_LABELS[t.category]}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseLocalDate(t.transaction_date), "d 'de' MMMM yyyy", { locale: es })}
                          {t.notes ? ` . ${t.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="status-badge status-up-to-date">Pagado</span>
                        <span className="font-mono tabular-nums text-sm font-semibold">{formatCurrency(Number(t.amount))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
