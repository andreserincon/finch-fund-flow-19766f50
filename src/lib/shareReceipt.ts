/**
 * @file shareReceipt.ts
 * @description Arma y comparte el comprobante de pago de una transaccion, y
 *   ofrece una burbuja (toast con boton) para compartirlo justo despues de
 *   registrar el movimiento. Centraliza la logica que usan la pantalla de
 *   Transacciones (menu de la fila) y los formularios que crean ingresos de un
 *   hermano (Registrar movimiento y Registrar cobro).
 *
 *   El saldo "a la fecha del pago" sale de la funcion SQL get_member_balance_asof
 *   (no esta en los generated types; se llama con cast). El concepto se resuelve
 *   segun el origen: capita, nombre del evento o concepto del cobro.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getCurrencyForAccount, parseLocalDate } from '@/lib/utils';
import { CATEGORY_LABELS, type AccountType, type FeeType, type TransactionCategory } from '@/lib/types';
import { CHARGE_CATEGORY_LABELS, type ChargeCategory } from '@/lib/cobros-types';
import {
  shareMemberReceipt, LODGE_NAME, moneyText,
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

// El comprobante no usa pills, asi que el traductor de estados no hace falta.
const noI18n = (k: string) => k;

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

/** Arma el comprobante de la transaccion y abre el menu de compartir. */
export async function buildAndShareReceipt(tx: ReceiptSource, onShared?: () => void): Promise<void> {
  if (!tx.member_id) {
    toast.error('Este movimiento no tiene un hermano asociado.');
    return;
  }
  const { data: member } = await supabase
    .from('members')
    .select('full_name, phone_number, fee_type, masonic_grade, is_active')
    .eq('id', tx.member_id).maybeSingle();
  if (!member) {
    toast.error('No se pudo identificar al hermano del pago.');
    return;
  }
  const m = member as {
    full_name: string; phone_number: string | null; fee_type: FeeType;
    masonic_grade: string | null; is_active: boolean;
  };
  const { data: tes } = await supabase
    .from('members').select('full_name').eq('lodge_office', 'tesorero').limit(1).maybeSingle();
  const tesorero = (tes as { full_name?: string } | null)?.full_name ?? null;

  let balance: MemberBalanceInfo;
  try {
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc('get_member_balance_asof', { _member_id: tx.member_id, _as_of: tx.transaction_date });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as {
      capita_balance?: number; event_balance?: number; cobros_ars?: number; cobros_usd?: number;
    } | undefined;
    const capitaBal = Number(row?.capita_balance ?? 0);
    const eventoBal = Number(row?.event_balance ?? 0);
    const cobrosArs = Math.max(0, Number(row?.cobros_ars ?? 0));
    balance = {
      capitaBal,
      capitaStatus: capitaBal >= 0 ? 'al_dia' : 'impago',
      eventoBal,
      eventoOk: eventoBal >= 0,
      cobrosArs,
      cobrosUsd: Math.max(0, Number(row?.cobros_usd ?? 0)),
      totalBal: capitaBal + eventoBal - cobrosArs,
    };
  } catch {
    toast.error('No se pudo calcular el saldo a la fecha del pago.');
    return;
  }

  const { concept, note } = await resolveConcept(tx);
  const header: MemberHeaderInfo = {
    matricula: m.phone_number,
    fullName: m.full_name,
    feeType: m.fee_type,
    grade: m.masonic_grade,
    isActive: m.is_active,
  };
  const payment: ReceiptPaymentInfo = {
    dateText: format(parseLocalDate(tx.transaction_date), 'd MMM yyyy', { locale: es }),
    concept,
    note,
    amountText: `+${moneyText(tx.amount, getCurrencyForAccount(tx.account))}`,
  };
  const result = await shareMemberReceipt(header, payment, balance, { lodge: LODGE_NAME, tesorero }, noI18n);
  if (result === 'shared') {
    // Marca la transaccion como "comprobante compartido". No bloquea el compartir
    // si falla (p. ej. la funcion SQL aun no esta en la base).
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
