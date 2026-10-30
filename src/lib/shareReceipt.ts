/**
 * @file shareReceipt.ts
 * @description Arma y comparte el comprobante de pago de una transaccion, y
 *   ofrece una burbuja (toast con boton) para compartirlo justo despues de
 *   registrar el movimiento. Centraliza la logica que usan la pantalla de
 *   Transacciones (menu de la fila) y los formularios que crean ingresos de un
 *   hermano (Registrar movimiento y Registrar cobro).
 *
 *   Al compartir se mandan DOS imagenes: el comprobante del pago (solo el pago) y
 *   el estado actual del hermano (su saldo, como la tarjeta de Miembros). El
 *   concepto se resuelve segun el origen: capita, nombre del evento o cobro.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getCurrencyForAccount, parseLocalDate } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  type AccountType, type FeeType, type TransactionCategory, type MemberBalance, type PaymentStatus,
} from '@/lib/types';
import { CHARGE_CATEGORY_LABELS, type ChargeCategory } from '@/lib/cobros-types';
import { getMemberCapitaStatus, type FeeRates, type MemberEventTotals } from '@/lib/attention';
import {
  buildReceiptHtml, buildStatementHtml, shareImages, LODGE_NAME, moneyText,
  type MemberHeaderInfo, type MemberBalanceInfo, type ReceiptPaymentInfo,
} from '@/lib/memberImage';

/** Lo minimo que necesita el comprobante de una transaccion. */
export interface ReceiptSource {
  id: string;
  member_id: string | null;
  transaction_date: string;
  amount: number;
  account: AccountType;
  category: TransactionCategory;
  event_id?: string | null;
  notes?: string | null;
  expense_summary?: string | null;
  transaction_type?: string;
}

// Concepto especifico segun el origen del ingreso: capita, nombre del evento o
// el concepto del cobro (medalla/ritual/derecho); si no, la categoria + nota.
async function resolveConcept(tx: ReceiptSource): Promise<{ concept: string; note: string | null }> {
  if (tx.category === 'monthly_fee') return { concept: 'Cápita', note: tx.notes ?? null };
  if (tx.category === 'event_payment' && tx.event_id) {
    const { data } = await supabase
      .from('extraordinary_expenses').select('name').eq('id', tx.event_id).maybeSingle();
    return { concept: (data as { name?: string } | null)?.name ?? CATEGORY_LABELS[tx.category], note: tx.notes ?? null };
  }
  const { data: link } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
    };
  }).from('member_charge_payments').select('member_charges(category, note)').eq('transaction_id', tx.id).maybeSingle();
  const charge = (link as { member_charges?: { category: ChargeCategory; note: string | null } } | null)?.member_charges;
  if (charge) return { concept: CHARGE_CATEGORY_LABELS[charge.category], note: charge.note ?? tx.notes ?? null };
  return { concept: CATEGORY_LABELS[tx.category], note: tx.notes ?? tx.expense_summary ?? null };
}

/** True si de esta transaccion se puede emitir un comprobante (ingreso de un hermano). */
export function canShareReceipt(tx: ReceiptSource): boolean {
  return !!tx.member_id && (tx.transaction_type === undefined || tx.transaction_type === 'income');
}

/**
 * Estado ACTUAL del hermano (como la tarjeta de Miembros): encabezado + saldos
 * netos por concepto + el estado de capita de 4 estados. Se calcula igual que
 * Miembros: member_balances (vista) menos la parte de eventos, mas los cobros
 * abiertos, y el estado via getMemberCapitaStatus con la cuota del mes.
 */
async function fetchMemberEstado(memberId: string): Promise<{ header: MemberHeaderInfo; balance: MemberBalanceInfo } | null> {
  const { data: mbRow } = await supabase
    .from('member_balances')
    .select('member_id, full_name, phone_number, fee_type, is_active, total_fees_owed, total_paid')
    .eq('member_id', memberId).maybeSingle();
  if (!mbRow) return null;
  const mb = mbRow as {
    member_id: string; full_name: string; phone_number: string | null; fee_type: FeeType;
    is_active: boolean; total_fees_owed: number; total_paid: number;
  };
  const { data: mFull } = await supabase.from('members').select('masonic_grade').eq('id', memberId).maybeSingle();
  const grade = (mFull as { masonic_grade?: string | null } | null)?.masonic_grade ?? null;

  const { data: evRows } = await supabase
    .from('event_member_payments').select('amount_owed, amount_paid').eq('member_id', memberId);
  const evList = (evRows as { amount_owed: number; amount_paid: number }[] | null) ?? [];
  const eventOwed = evList.reduce((s, r) => s + Number(r.amount_owed), 0);
  const eventPaid = evList.reduce((s, r) => s + Number(r.amount_paid), 0);

  const { data: chRows } = await (supabase as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: unknown }> } };
  }).from('member_charges').select('amount, amount_paid, currency, status').eq('member_id', memberId);
  let cobrosArs = 0;
  let cobrosUsd = 0;
  for (const c of ((chRows as { amount: number; amount_paid: number; currency: string; status: string }[] | null) ?? [])) {
    if (c.status === 'paid' || c.status === 'cancelled') continue;
    const bal = Number(c.amount) - Number(c.amount_paid);
    if (bal <= 0.5) continue;
    if (c.currency === 'USD') cobrosUsd += bal; else cobrosArs += bal;
  }

  // Cuota de capita del mes actual, para clasificar el estado como en Miembros.
  const ym = `${new Date().toISOString().slice(0, 7)}-01`;
  const { data: feeRow } = await supabase
    .from('monthly_fees').select('amount').eq('year_month', ym).eq('fee_type', mb.fee_type).maybeSingle();
  const monthlyFee = feeRow ? Number((feeRow as { amount: number }).amount) : 0;

  const totalOwed = Number(mb.total_fees_owed);
  const totalPaid = Number(mb.total_paid);
  const capitaBal = (totalPaid - eventPaid) - (totalOwed - eventOwed);
  const eventoBal = eventPaid - eventOwed;
  const totalBal = capitaBal + eventoBal - cobrosArs;

  const ev: MemberEventTotals = { owed: { [memberId]: eventOwed }, paid: { [memberId]: eventPaid } };
  const fakeMB = {
    member_id: memberId, fee_type: mb.fee_type, total_fees_owed: totalOwed, total_paid: totalPaid,
  } as unknown as MemberBalance;
  const fees = { [mb.fee_type]: monthlyFee } as unknown as FeeRates;
  const capitaStatus: PaymentStatus = mb.is_active ? getMemberCapitaStatus(fakeMB, fees, undefined, ev) : 'al_dia';

  return {
    header: { matricula: mb.phone_number, fullName: mb.full_name, feeType: mb.fee_type, grade, isActive: mb.is_active },
    balance: { capitaBal, capitaStatus, eventoBal, eventoOk: eventoBal >= 0, cobrosArs, cobrosUsd, totalBal },
  };
}

/**
 * Arma y comparte DOS imagenes: el comprobante del pago (solo el pago) y el
 * estado actual del hermano. Si el compartir fue exitoso, marca la transaccion.
 */
export async function buildAndShareReceipt(tx: ReceiptSource, onShared?: () => void): Promise<void> {
  if (!tx.member_id) {
    toast.error('Este movimiento no tiene un hermano asociado.');
    return;
  }
  const estado = await fetchMemberEstado(tx.member_id);
  if (!estado) {
    toast.error('No se pudo identificar al hermano del pago.');
    return;
  }
  const { data: tes } = await supabase
    .from('members').select('full_name').eq('lodge_office', 'tesorero').limit(1).maybeSingle();
  const tesorero = (tes as { full_name?: string } | null)?.full_name ?? null;

  const { concept, note } = await resolveConcept(tx);
  const payment: ReceiptPaymentInfo = {
    dateText: format(parseLocalDate(tx.transaction_date), 'd MMM yyyy', { locale: es }),
    concept,
    note,
    amountText: `+${moneyText(tx.amount, getCurrencyForAccount(tx.account))}`,
  };
  const key = estado.header.matricula || estado.header.fullName;
  const today = format(new Date(), 'd MMM yyyy', { locale: es });
  // Sin mensaje de texto: se mandan solo las imagenes (el comprobante y el
  // estado de cuenta), para que no parezca que las dos imagenes son el comprobante.
  const result = await shareImages([
    { html: buildReceiptHtml(estado.header, payment, { lodge: LODGE_NAME, tesorero }), fileName: `comprobante-${key}.png` },
    { html: buildStatementHtml(estado.header, estado.balance, { lodge: LODGE_NAME, tesorero }, today), fileName: `estado-${key}.png` },
  ]);
  if (result === 'shared') {
    // Marca la transaccion como "comprobante compartido". No bloquea si falla.
    try {
      const { error: markErr } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
      }).rpc('mark_receipt_shared', { _transaction_id: tx.id });
      if (!markErr) onShared?.();
    } catch {
      /* el comprobante ya se compartio; el marcado es secundario */
    }
  }
}

/**
 * Burbuja que ofrece compartir el comprobante recien registrado. Solo aparece
 * para un ingreso de un hermano; en otro caso no hace nada.
 */
export function promptShareReceipt(tx: ReceiptSource, onShared?: () => void): void {
  if (!canShareReceipt(tx)) return;
  toast('Pago registrado', {
    description: '¿Querés compartir el comprobante?',
    duration: 8000,
    action: {
      label: 'Compartir',
      onClick: () => { void buildAndShareReceipt(tx, onShared); },
    },
  });
}
