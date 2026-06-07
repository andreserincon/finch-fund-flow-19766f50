/**
 * @file reminderDetail.ts
 * @description Builds the itemized debt detail and the full reminder message
 *   for a member who requires attention, for the WhatsApp click-to-chat flow.
 *   Pure functions, no data fetching.
 *
 *   Rules (confirmed with the treasurer):
 *   - One line per cuota; capitas first, then events; only overdue/elapsed cuotas.
 *   - Payments are applied to the oldest cuota first.
 *   - Capitas: one per month from join to the current month, at that month's fee
 *     (honoring the member's fee-type history). Capita debt is capita-only (event
 *     payments excluded), matching the "Demorado" rule in src/lib/attention.
 *   - Events: one cuota per month from charge_from_date, value = total /
 *     installments; only elapsed cuotas, labeled with the event name.
 */

import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/utils';
import type { MemberBalance, FeeType } from '@/lib/types';

export interface MonthlyFeeRow {
  /** 'YYYY-MM-01' */
  year_month: string;
  fee_type: FeeType;
  amount: number;
}

export interface EventParticipation {
  event_name: string;
  charge_from_date: string | null;
  installments: number;
  amount_owed: number;
  amount_paid: number;
}

export interface DebtLine {
  /** e.g. "la capita de mayo" or "Cena Solsticial (cuota junio)" */
  label: string;
  amount: number;
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function monthName(d: Date, asOf: Date): string {
  const base = MONTHS_ES[d.getMonth()];
  return d.getFullYear() !== asOf.getFullYear() ? `${base} ${d.getFullYear()}` : base;
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthsInclusive(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
}

/** Capita (monthly dues) lines, oldest unpaid first. */
export function capitaLines(
  member: MemberBalance,
  monthlyFees: MonthlyFeeRow[],
  feeTypeForMonth: (memberId: string, yearMonth: string) => FeeType | null,
  capitaPaid: number,
  asOf: Date,
): DebtLine[] {
  const feeMap = new Map<string, number>();
  for (const f of monthlyFees) feeMap.set(`${f.year_month}:${f.fee_type}`, Number(f.amount));

  const start = firstOfMonth(parseLocalDate(member.join_date));
  const end = firstOfMonth(asOf);
  const lines: DebtLine[] = [];
  let remaining = capitaPaid;

  let cur = new Date(start);
  while (cur <= end) {
    const ym = format(cur, 'yyyy-MM-dd');
    const ft = feeTypeForMonth(member.member_id, ym) ?? member.fee_type;
    const fee = feeMap.get(`${ym}:${ft}`) ?? 0;
    const paidThis = Math.min(remaining, fee);
    remaining -= paidThis;
    const unpaid = fee - paidThis;
    if (unpaid > 0.5) {
      lines.push({ label: `la capita de ${monthName(cur, asOf)}`, amount: unpaid });
    }
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return lines;
}

/** Event cuota lines: only elapsed cuotas, oldest unpaid first, per event. */
export function eventLines(parts: EventParticipation[], asOf: Date): DebtLine[] {
  const lines: DebtLine[] = [];
  const end = firstOfMonth(asOf);

  for (const p of parts) {
    const total = Number(p.amount_owed);
    if (total <= 0) continue;
    const n = Math.max(1, Math.floor(Number(p.installments) || 1));
    const perCuota = total / n;

    let start: Date;
    let elapsed: number;
    if (p.charge_from_date) {
      start = firstOfMonth(parseLocalDate(p.charge_from_date));
      elapsed = monthsInclusive(start, end);
    } else {
      // No schedule set: treat the whole amount as currently due.
      start = end;
      elapsed = n;
    }
    if (elapsed <= 0) continue; // charge starts in the future
    elapsed = Math.min(elapsed, n);

    let remaining = Number(p.amount_paid);
    for (let i = 0; i < elapsed; i++) {
      const paidThis = Math.min(remaining, perCuota);
      remaining -= paidThis;
      const unpaid = perCuota - paidThis;
      if (unpaid > 0.5) {
        const cuotaMonth = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const label = n > 1 ? `${p.event_name} (cuota ${monthName(cuotaMonth, asOf)})` : p.event_name;
        lines.push({ label, amount: unpaid });
      }
    }
  }
  return lines;
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(amount));
}

/** Join lines into the inline detail string (capitas first, then events). */
export function joinDetail(lines: DebtLine[], currency = 'ARP'): string {
  const parts = lines.map((l) => `${fmt(l.amount)} ${currency} de ${l.label}`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** First name, for the masonic greeting. */
export function firstName(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || fullName;
}

/** The full reminder message (matches the treasurer's tone). */
export function buildReminderMessage(memberFirstName: string, detail: string): string {
  return (
    `Mi Q:.H:. ${memberFirstName}, muy buenas. Paso por acá para darte tu status en el tesoro de la Log:.\n\n` +
    `Tenés pendiente: ${detail}.\n\n` +
    `Este mensaje no es para presionarte a pagar, sino informativo, para que lleves tu status y no caigas en mora ni en el art. 201. Cualquier duda, quedo a disposición por acá.\n\n` +
    `TAF. Tu H:. Tes:.`
  );
}

/**
 * Click-to-chat URL with the message prefilled. Null if no number.
 * On desktop, links straight to WhatsApp Web (web.whatsapp.com/send) since the
 * treasurer is already logged in there; wa.me redirects through
 * api.whatsapp.com, which some browsers/extensions block. On mobile, uses
 * wa.me so the WhatsApp app opens.
 */
export function whatsappLink(
  whatsappNumber: string | null | undefined,
  message: string,
  useWeb = false,
): string | null {
  if (!whatsappNumber) return null;
  const digits = whatsappNumber.replace(/\D/g, '');
  if (!digits) return null;
  const text = encodeURIComponent(message);
  return useWeb
    ? `https://web.whatsapp.com/send?phone=${digits}&text=${text}`
    : `https://wa.me/${digits}?text=${text}`;
}
