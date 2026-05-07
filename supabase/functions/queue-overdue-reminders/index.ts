/**
 * @file queue-overdue-reminders/index.ts
 * @description Scheduled edge function that builds the WhatsApp reminder
 *   queue on the 3rd business day of each month. Run it daily; the
 *   function self-exits unless today is the 3rd business day. For each
 *   overdue active member it inserts a `payment_reminders` row with
 *   status `pending_review` and a draft message. The treasurer reviews
 *   and dispatches via /recordatorios + send-whatsapp-reminder.
 *
 *   Overdue definition (matches the Dashboard logic): an active member
 *   whose total_fees_owed - total_paid is greater than their
 *   monthly_fee_amount (i.e. owes more than one full cuota).
 *
 *   Members with whatsapp_opt_out=true are excluded entirely. Members
 *   without a whatsapp_number are queued with status `failed` and a
 *   "missing number" reason so the treasurer can follow up manually.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** True if `date` is the Nth business day of its month (weekends skipped) */
function isNthBusinessDayOfMonth(date: Date, n: number): boolean {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  let day = 1;
  let business = 0;
  while (true) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCMonth() !== month) return false;
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      business++;
      if (business === n) {
        return d.getUTCDate() === date.getUTCDate();
      }
    }
    day++;
  }
}

function buildDraftMessage(opts: {
  memberName: string;
  amountOwed: number;
  monthLabel: string;
}): string {
  const amount = opts.amountOwed.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  });
  return (
    `Hola ${opts.memberName}, te recordamos que tenés un saldo pendiente de ` +
    `${amount} correspondiente a ${opts.monthLabel}. Podés saldarlo coordinando ` +
    `con el Tesorero. Gracias.`
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const force = new URL(req.url).searchParams.get('force') === '1';

    if (!force && !isNthBusinessDayOfMonth(now, 3)) {
      console.log(
        `[queue-overdue-reminders] ${now.toISOString()} is not the 3rd business day of the month; skipping.`
      );
      return new Response(
        JSON.stringify({ skipped: true, reason: 'not_third_business_day' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const periodYear = now.getUTCFullYear();
    const periodMonth = now.getUTCMonth() + 1;
    const monthLabel = `${MONTH_NAMES_ES[periodMonth - 1]} ${periodYear}`;

    const { data: balances, error: balancesError } = await supabase
      .from('member_balances')
      .select('member_id, full_name, monthly_fee_amount, total_fees_owed, total_paid, is_active');

    if (balancesError) throw balancesError;

    const { data: members, error: membersError } = await supabase
      .from('members')
      .select('id, whatsapp_number, whatsapp_opt_out');

    if (membersError) throw membersError;

    const memberById = new Map<string, { whatsapp_number: string | null; whatsapp_opt_out: boolean }>(
      (members ?? []).map((m: any) => [m.id, m])
    );

    const overdue = (balances ?? []).filter((b: any) => {
      if (!b.is_active) return false;
      const owed = Number(b.total_fees_owed ?? 0);
      const paid = Number(b.total_paid ?? 0);
      const monthlyFee = Number(b.monthly_fee_amount ?? 0);
      return owed - paid > monthlyFee && monthlyFee > 0;
    });

    let inserted = 0;
    let skippedOptOut = 0;
    let queuedMissingNumber = 0;
    let alreadyQueued = 0;
    const failures: { member_id: string; reason: string }[] = [];

    for (const b of overdue) {
      const m = memberById.get(b.member_id);
      if (m?.whatsapp_opt_out) {
        skippedOptOut++;
        continue;
      }

      const balance = Number(b.total_fees_owed) - Number(b.total_paid);
      const draft = buildDraftMessage({
        memberName: b.full_name as string,
        amountOwed: balance,
        monthLabel,
      });
      const whatsappNumber = m?.whatsapp_number ?? null;

      const row = {
        member_id: b.member_id as string,
        period_year: periodYear,
        period_month: periodMonth,
        amount_owed: balance,
        whatsapp_number: whatsappNumber,
        draft_message: draft,
        status: whatsappNumber ? 'pending_review' : 'failed',
        failure_reason: whatsappNumber ? null : 'Falta número de WhatsApp',
      };

      const { error } = await supabase
        .from('payment_reminders')
        .insert(row);

      if (error) {
        if (error.code === '23505') {
          // unique violation — already queued for this period
          alreadyQueued++;
          continue;
        }
        failures.push({ member_id: b.member_id, reason: error.message });
        continue;
      }

      if (whatsappNumber) inserted++;
      else queuedMissingNumber++;
    }

    return new Response(
      JSON.stringify({
        period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
        considered: overdue.length,
        inserted,
        skippedOptOut,
        queuedMissingNumber,
        alreadyQueued,
        failures,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[queue-overdue-reminders] error', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
