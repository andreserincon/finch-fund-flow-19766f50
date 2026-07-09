import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReportData {
  year: number;
  month: number;
  forceRegenerate?: boolean;
}

/**
 * Render an HTML string to a real PDF via PDFShift. Returns the PDF as
 * a Uint8Array ready to upload to Supabase Storage.
 *
 * PDFShift uses Chromium internally and supports proper repeating
 * header/footer on every page with `<span class="pageNumber"></span>`
 * and `<span class="totalPages"></span>` placeholders.
 *
 * Requires the PDFSHIFT_API_KEY secret to be set in Supabase Edge
 * Function secrets.
 */
async function convertHtmlToPdf(opts: {
  html: string;
  headerHtml?: string;
  footerHtml?: string;
  marginTopMm?: number;
  marginBottomMm?: number;
  marginSideMm?: number;
}): Promise<Uint8Array> {
  const apiKey = Deno.env.get('PDFSHIFT_API_KEY');
  if (!apiKey) {
    throw new Error('PDFSHIFT_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    source: opts.html,
    format: 'A4',
    landscape: false,
    use_print: true,
    margin: {
      top: `${opts.marginTopMm ?? (opts.headerHtml ? 22 : 15)}mm`,
      right: `${opts.marginSideMm ?? 12}mm`,
      bottom: `${opts.marginBottomMm ?? (opts.footerHtml ? 18 : 15)}mm`,
      left: `${opts.marginSideMm ?? 12}mm`,
    },
  };
  if (opts.headerHtml) {
    // start_at: 2 skips the running header on page 1 (which has the
    // big main header already).
    body.header = { source: opts.headerHtml.trim(), spacing: '4mm', start_at: 2 };
  }
  if (opts.footerHtml) {
    body.footer = { source: opts.footerHtml.trim(), spacing: '4mm' };
  }

  const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`api:${apiKey}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PDFShift failed: ${res.status} ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // A call carrying the service-role key is the scheduled/cron path (the
    // automatic monthly generator delegating here). It has no logged-in user,
    // so we trust the secret itself and skip the per-user treasurer gate.
    // Every other caller must be an authenticated treasurer or admin.
    const bearerToken = authHeader.slice('Bearer '.length).trim();
    const isSystemCall = bearerToken === supabaseServiceKey;

    // Client for auth validation
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Null on the system path, mirroring the old scheduled job (generated_by null).
    let userId: string | null = null;

    if (!isSystemCall) {
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = user.id;

      // Check if user is treasurer or admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .in('role', ['treasurer', 'admin'])
        .maybeSingle();

      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Only treasurers can generate reports' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { year, month, forceRegenerate = false }: ReportData = await req.json();

    // Validate inputs
    if (!year || !month || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: 'Invalid year or month' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if report already exists
    const { data: existingReport } = await supabase
      .from('monthly_reports')
      .select('id, status')
      .eq('report_year', year)
      .eq('report_month', month)
      .maybeSingle();

    if (existingReport && !forceRegenerate) {
      return new Response(JSON.stringify({ 
        error: 'Report already exists', 
        reportId: existingReport.id 
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate month end date
    const monthEndDate = new Date(year, month, 0); // Last day of the month
    const monthStartDate = new Date(year, month - 1, 1);
    const monthEndStr = monthEndDate.toISOString().split('T')[0];
    const monthStartStr = monthStartDate.toISOString().split('T')[0];

    console.log(`Generating report for ${year}-${month.toString().padStart(2, '0')}`);

    // Fetch all required data - including historical data for point-in-time calculations
    const [
      transactionsResult,
      membersResult,
      allMonthlyFeesResult,
      loansResult,
      eventsResult,
      eventPaymentsResult,
      monthlyFeesResult,
      feeTypeHistoryResult,
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .gte('transaction_date', monthStartStr)
        .lte('transaction_date', monthEndStr),
      supabase.from('members').select('*').eq('is_active', true),
      // Get all monthly fees up to month end for balance calculation
      supabase.from('monthly_fees').select('*').lte('year_month', monthEndStr),
      // Pull all loans created on or before month end. We filter for
      // "active as of month end" in app code below using paid_date so that
      // historical reports reflect the snapshot, not today's status.
      supabase.from('loans').select('*, member:members(full_name, phone_number)').lte('loan_date', monthEndStr),
      supabase.from('extraordinary_expenses').select('*').eq('is_active', true),
      supabase.from('event_member_payments').select('*'),
      supabase.from('monthly_fees').select('*').eq('year_month', `${year}-${month.toString().padStart(2, '0')}-01`),
      supabase.from('member_fee_type_history').select('*'),
    ]);

    const transactions = transactionsResult.data || [];
    const members = membersResult.data || [];
    const allMonthlyFees = allMonthlyFeesResult.data || [];
    const allLoans = loansResult.data || [];
    const events = eventsResult.data || [];
    const eventPayments = eventPaymentsResult.data || [];
    const monthlyFees = monthlyFeesResult.data || [];
    const feeTypeHistory = feeTypeHistoryResult.data || [];

    // Fetch all transactions, transfers, and loan payments up to month end;
    // needed for balance calculations and point-in-time loan snapshots.
    const [allTransactionsResult, allTransfersResult, loanPaymentsResult] = await Promise.all([
      supabase.from('transactions').select('*').lte('transaction_date', monthEndStr),
      supabase.from('account_transfers').select('*').lte('transfer_date', monthEndStr),
      supabase.from('loan_payments').select('loan_id, amount, payment_date').lte('payment_date', monthEndStr),
    ]);

    const allTransactions = allTransactionsResult.data || [];
    const allTransfers = allTransfersResult.data || [];
    const loanPaymentsAsOfMonthEnd = loanPaymentsResult.data || [];

    // Build point-in-time loan view: keep only loans that were active on
    // monthEnd (not cancelled, not yet fully paid as of that date), and
    // override amount_paid with the sum of payments dated on or before
    // monthEnd. Downstream code reads `loan.amount_paid` / computes
    // `amount - amount_paid`; overriding the field keeps the rest of the
    // function unchanged.
    const paidByLoanId = new Map<string, number>();
    for (const p of loanPaymentsAsOfMonthEnd) {
      paidByLoanId.set(p.loan_id, (paidByLoanId.get(p.loan_id) || 0) + Number(p.amount));
    }
    const loans = allLoans
      .filter((l: any) =>
        l.status !== 'cancelled' &&
        (!l.paid_date || l.paid_date > monthEndStr)
      )
      .map((l: any) => ({
        ...l,
        amount_paid: paidByLoanId.get(l.id) || 0,
      }))
      .filter((l: any) => Number(l.amount) - Number(l.amount_paid) > 0);

    // Helper function to get member's fee type for a given month
    const getMemberFeeTypeForMonth = (memberId: string, monthDate: string): string => {
      const memberHistory = feeTypeHistory
        .filter((h: any) => h.member_id === memberId && h.effective_from <= monthDate)
        .sort((a: any, b: any) => b.effective_from.localeCompare(a.effective_from));
      
      if (memberHistory.length > 0) {
        return memberHistory[0].fee_type;
      }
      
      // Fallback to current fee type from member record
      const member = members.find((m: any) => m.id === memberId);
      return member?.fee_type || 'standard';
    };

    // Calculate member balances split into capita (monthly fees) and events,
    // as of month end (point-in-time snapshot).
    const calculateMemberBalanceAsOfDate = (memberId: string, asOfDate: string, memberJoinDate: string) => {
      // ── Capita (monthly fees) ──
      let capitaOwed = 0;
      allMonthlyFees.forEach((fee: any) => {
        const feeMonth = fee.year_month;
        if (feeMonth >= memberJoinDate.substring(0, 7) + '-01' && feeMonth <= asOfDate) {
          const memberFeeType = getMemberFeeTypeForMonth(memberId, feeMonth);
          if (fee.fee_type === memberFeeType) {
            capitaOwed += Number(fee.amount);
          }
        }
      });

      const capitaPaid = allTransactions
        .filter((t: any) =>
          t.member_id === memberId &&
          t.transaction_type === 'income' &&
          t.category === 'monthly_fee' &&
          t.transaction_date <= asOfDate
        )
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      // ── Events (only those whose charge_from_date is null or <= asOfDate) ──
      const eligibleEventIds = new Set(
        events
          .filter((e: any) => !e.charge_from_date || e.charge_from_date <= asOfDate)
          .map((e: any) => e.id)
      );

      const eventOwed = eventPayments
        .filter((ep: any) => ep.member_id === memberId && eligibleEventIds.has(ep.event_id))
        .reduce((sum: number, ep: any) => sum + Number(ep.amount_owed), 0);

      const eventPaid = allTransactions
        .filter((t: any) =>
          t.member_id === memberId &&
          t.transaction_type === 'income' &&
          t.category === 'event_payment' &&
          t.transaction_date <= asOfDate &&
          (!t.event_id || eligibleEventIds.has(t.event_id))
        )
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      return {
        capitaBalance: capitaPaid - capitaOwed,
        eventBalance: eventPaid - eventOwed,
      };
    };

    // Build point-in-time member balances
    const memberBalances = members.map((m: any) => {
      const { capitaBalance, eventBalance } = calculateMemberBalanceAsOfDate(m.id, monthEndStr, m.join_date);
      return {
        member_id: m.id,
        full_name: m.full_name,
        phone_number: m.phone_number,
        monthly_fee_amount: m.monthly_fee_amount,
        fee_type: getMemberFeeTypeForMonth(m.id, monthEndStr),
        is_active: m.is_active,
        join_date: m.join_date,
        capita_balance: capitaBalance,
        event_balance: eventBalance,
        current_balance: capitaBalance + eventBalance,
      };
    });

    let bankBalance = 0;
    let greatLodgeBalance = 0;
    let savingsBalance = 0;

    (allTransactions || []).forEach((t: any) => {
      const amount = t.transaction_type === 'income' ? t.amount : -t.amount;
      if (t.account === 'bank') bankBalance += amount;
      else if (t.account === 'great_lodge') greatLodgeBalance += amount;
      else if (t.account === 'savings') savingsBalance += amount;
    });

    (allTransfers || []).forEach((t: any) => {
      if (t.from_account === 'bank') bankBalance -= t.amount;
      else if (t.from_account === 'great_lodge') greatLodgeBalance -= t.amount;
      else if (t.from_account === 'savings') savingsBalance -= t.amount;

      if (t.to_account === 'bank') bankBalance += t.amount;
      else if (t.to_account === 'great_lodge') greatLodgeBalance += t.amount;
      else if (t.to_account === 'savings') savingsBalance += t.amount;
    });

    // Fetch official exchange rate for USD to ARS conversion
    let exchangeRate = 1200; // Default fallback rate
    try {
      const rateResponse = await fetch('https://dolarapi.com/v1/dolares/oficial');
      if (rateResponse.ok) {
        const rateData = await rateResponse.json();
        exchangeRate = rateData.venta || 1200;
        console.log(`Exchange rate fetched: ${exchangeRate}`);
      }
    } catch (e) {
      console.warn('Failed to fetch exchange rate, using fallback:', e);
    }

    // Calculate total ARS balance including savings converted
    const savingsInARS = savingsBalance * exchangeRate;
    const totalARSBalance = bankBalance + greatLodgeBalance + savingsInARS;

    // Calculate monthly flows (including USD transactions converted)
    const monthlyInflowsARS = transactions
      .filter((t: any) => t.transaction_type === 'income' && t.account !== 'savings')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    
    const monthlyInflowsUSD = transactions
      .filter((t: any) => t.transaction_type === 'income' && t.account === 'savings')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalInflows = monthlyInflowsARS + (monthlyInflowsUSD * exchangeRate);

    const monthlyOutflowsARS = transactions
      .filter((t: any) => t.transaction_type === 'expense' && t.account !== 'savings')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    
    const monthlyOutflowsUSD = transactions
      .filter((t: any) => t.transaction_type === 'expense' && t.account === 'savings')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalOutflows = monthlyOutflowsARS + (monthlyOutflowsUSD * exchangeRate);

    const netResult = totalInflows - totalOutflows;

    // Calculate member debt and credit
    let outstandingMemberDebt = 0;
    let prepaidMemberCredit = 0;

    memberBalances.forEach((mb: any) => {
      const balance = Number(mb.current_balance || 0);
      if (balance < 0) outstandingMemberDebt += Math.abs(balance);
      else if (balance > 0) prepaidMemberCredit += balance;
    });

    // Monthly fee coverage
    const standardFee = monthlyFees.find((f: any) => f.fee_type === 'standard')?.amount || 0;
    const solidarityFee = monthlyFees.find((f: any) => f.fee_type === 'solidarity')?.amount || 0;

    const expectedMonthlyFees = members.reduce((sum: number, m: any) => {
      return sum + (m.fee_type === 'standard' ? standardFee : solidarityFee);
    }, 0);

    const collectedMonthlyFees = transactions
      .filter((t: any) => t.category === 'monthly_fee')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const collectionPercentage = expectedMonthlyFees > 0 
      ? Math.round((collectedMonthlyFees / expectedMonthlyFees) * 100) 
      : 0;

    // Members missing payment
    const membersPaidThisMonth = new Set(
      transactions
        .filter((t: any) => t.category === 'monthly_fee' && t.member_id)
        .map((t: any) => t.member_id)
    );
    const membersMissingPayment = members.filter((m: any) => !membersPaidThisMonth.has(m.id)).length;

    // Create or update report
    let reportId: string;

    if (existingReport && forceRegenerate) {
      // Delete old snapshots
      await Promise.all([
        supabase.from('report_member_snapshots').delete().eq('report_id', existingReport.id),
        supabase.from('report_loan_snapshots').delete().eq('report_id', existingReport.id),
        supabase.from('report_event_snapshots').delete().eq('report_id', existingReport.id),
      ]);

      const { error: updateError } = await supabase
        .from('monthly_reports')
        .update({
          status: 'generating',
          generated_at: null,
          generated_by: userId,
          pdf_path: null,
          bank_balance: bankBalance,
          great_lodge_balance: greatLodgeBalance,
          savings_balance: savingsBalance,
          total_inflows: totalInflows,
          total_outflows: totalOutflows,
          net_result: netResult,
          outstanding_member_debt: outstandingMemberDebt,
          prepaid_member_credit: prepaidMemberCredit,
          net_treasury_position: prepaidMemberCredit - outstandingMemberDebt,
          expected_monthly_fees: expectedMonthlyFees,
          collected_monthly_fees: collectedMonthlyFees,
          collection_percentage: collectionPercentage,
          members_missing_payment: membersMissingPayment,
          outstanding_loans_ars: loans.filter((l: any) => l.account !== 'savings').reduce((s: number, l: any) => s + (Number(l.amount) - Number(l.amount_paid)), 0),
          outstanding_loans_usd: loans.filter((l: any) => l.account === 'savings').reduce((s: number, l: any) => s + (Number(l.amount) - Number(l.amount_paid)), 0),
        })
        .eq('id', existingReport.id);

      if (updateError) throw updateError;
      reportId = existingReport.id;
    } else {
      const { data: newReport, error: insertError } = await supabase
        .from('monthly_reports')
        .insert({
          report_year: year,
          report_month: month,
          status: 'generating',
          generated_by: userId,
          bank_balance: bankBalance,
          great_lodge_balance: greatLodgeBalance,
          savings_balance: savingsBalance,
          total_inflows: totalInflows,
          total_outflows: totalOutflows,
          net_result: netResult,
          outstanding_member_debt: outstandingMemberDebt,
          prepaid_member_credit: prepaidMemberCredit,
          net_treasury_position: prepaidMemberCredit - outstandingMemberDebt,
          expected_monthly_fees: expectedMonthlyFees,
          collected_monthly_fees: collectedMonthlyFees,
          collection_percentage: collectionPercentage,
          members_missing_payment: membersMissingPayment,
          outstanding_loans_ars: loans.filter((l: any) => l.account !== 'savings').reduce((s: number, l: any) => s + (Number(l.amount) - Number(l.amount_paid)), 0),
          outstanding_loans_usd: loans.filter((l: any) => l.account === 'savings').reduce((s: number, l: any) => s + (Number(l.amount) - Number(l.amount_paid)), 0),
        })
        .select()
        .single();

      if (insertError) throw insertError;
      reportId = newReport.id;
    }

    // Create member snapshots; status is derived from capita balance only.
    const memberSnapshots = memberBalances.map((mb: any) => {
      const capitaBalance = Number(mb.capita_balance || 0);
      const eventBalance = Number(mb.event_balance || 0);
      const monthlyFeeAmount = mb.fee_type === 'standard' ? standardFee : solidarityFee;

      let status = 'up_to_date';
      let monthsAhead = 0;
      let monthsOverdue = 0;
      let overdueAmount = 0;

      if (capitaBalance > monthlyFeeAmount) {
        status = 'ahead';
        monthsAhead = monthlyFeeAmount > 0 ? Math.floor(capitaBalance / monthlyFeeAmount) : 0;
      } else if (capitaBalance < -monthlyFeeAmount) {
        status = 'overdue';
        monthsOverdue = monthlyFeeAmount > 0 ? Math.ceil(Math.abs(capitaBalance) / monthlyFeeAmount) : 0;
        overdueAmount = Math.abs(capitaBalance);
      } else if (capitaBalance < 0) {
        status = 'unpaid';
      }

      // Get last payment date
      const memberTransactions = (allTransactions || [])
        .filter((t: any) => t.member_id === mb.member_id && t.category === 'monthly_fee')
        .sort((a: any, b: any) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

      const lastPaymentDate = memberTransactions.length > 0 ? memberTransactions[0].transaction_date : null;

      return {
        report_id: reportId,
        member_id: mb.member_id,
        full_name: mb.full_name,
        phone_number: mb.phone_number,
        fee_type: mb.fee_type,
        monthly_fee_amount: monthlyFeeAmount,
        balance_at_month_end: capitaBalance + eventBalance,
        capita_balance: capitaBalance,
        event_balance: eventBalance,
        status,
        months_ahead: monthsAhead,
        months_overdue: monthsOverdue,
        overdue_amount: overdueAmount,
        last_payment_date: lastPaymentDate,
      };
    });

    if (memberSnapshots.length > 0) {
      // phone_number is render-only here; strip before persisting in case
      // report_member_snapshots doesn't have that column.
      const memberSnapshotsForDb = memberSnapshots.map(({ phone_number, ...rest }: any) => rest);
      await supabase.from('report_member_snapshots').insert(memberSnapshotsForDb);
    }

    // Create loan snapshots
    const loanSnapshots = loans.map((loan: any) => ({
      report_id: reportId,
      loan_id: loan.id,
      borrower_name: loan.member?.full_name || 'Unknown',
      borrower_matricula: loan.member?.phone_number || '-',
      account: loan.account,
      original_amount: loan.amount,
      amount_paid: loan.amount_paid,
      outstanding_balance: loan.amount - loan.amount_paid,
      payment_status: loan.amount_paid >= loan.amount ? 'fully_paid' : 
                     loan.amount_paid > 0 ? 'partial' : 'pending',
    }));

    if (loanSnapshots.length > 0) {
      // borrower_matricula is render-only; strip before persisting since the
      // DB column doesn't exist on report_loan_snapshots.
      const loanSnapshotsForDb = loanSnapshots.map(({ borrower_matricula, ...rest }: any) => rest);
      await supabase.from('report_loan_snapshots').insert(loanSnapshotsForDb);
    }

    // Create event snapshots; exclude events whose charge_from_date is after month end.
    const eligibleEventsForReport = events.filter(
      (e: any) => !e.charge_from_date || e.charge_from_date <= monthEndStr
    );
    const eventSnapshots = eligibleEventsForReport.map((event: any) => {
      const eventPaymentsForEvent = eventPayments.filter((ep: any) => ep.event_id === event.id);
      const totalAmount = eventPaymentsForEvent.reduce((sum: number, ep: any) => sum + Number(ep.amount_owed), 0);
      const amountCollected = eventPaymentsForEvent.reduce((sum: number, ep: any) => sum + Number(ep.amount_paid), 0);
      const membersIncluded = eventPaymentsForEvent.length;
      const membersUnpaid = eventPaymentsForEvent.filter((ep: any) => ep.amount_paid < ep.amount_owed).length;

      // Gastos del evento ESTE MES (ARS only; USD gastos en eventos son
      // edge case, se ven en la sección Detalle por Evento si los hay).
      const expensesArs = transactions
        .filter((t: any) =>
          t.category === 'event_expense' &&
          t.event_id === event.id &&
          t.account !== 'savings'
        )
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      // Overall (lifetime up to month end) cash position of the event, from the
      // real transactions tagged with this event, matching the events module
      // (EventOverview): ingresos event_payment menos gastos event_expense.
      // USD legs (account 'savings') se convierten a ARS al TC del reporte para
      // un único balance histórico. Fixes the old "Balance Evento" that mixed
      // cuota histórica con gastos de un solo mes.
      const eventTx = (allTransactions || []).filter((t: any) => t.event_id === event.id);
      const foldToARS = (t: any) =>
        t.account === 'savings' ? Number(t.amount) * exchangeRate : Number(t.amount);
      const recaudadoHistorico = eventTx
        .filter((t: any) => t.category === 'event_payment')
        .reduce((sum: number, t: any) => sum + foldToARS(t), 0);
      const gastadoHistorico = eventTx
        .filter((t: any) => t.category === 'event_expense')
        .reduce((sum: number, t: any) => sum + foldToARS(t), 0);
      const balanceHistorico = recaudadoHistorico - gastadoHistorico;

      return {
        report_id: reportId,
        event_id: event.id,
        event_name: event.name,
        total_amount: totalAmount,
        amount_collected: amountCollected,
        outstanding_amount: totalAmount - amountCollected,
        // Render-only fields (stripped before DB insert below).
        expenses_ars: expensesArs,
        balance_ars: amountCollected - expensesArs,
        recaudado_historico: recaudadoHistorico,
        gastado_historico: gastadoHistorico,
        balance_historico: balanceHistorico,
        members_included: membersIncluded,
        members_unpaid: membersUnpaid,
        event_status: amountCollected >= totalAmount ? 'settled' : 'pending',
      };
    });

    if (eventSnapshots.length > 0) {
      // expenses_ars and balance_ars are render-only; strip before
      // persisting since report_event_snapshots doesn't have those columns.
      const eventSnapshotsForDb = eventSnapshots.map(
        ({ expenses_ars, balance_ars, recaudado_historico, gastado_historico, balance_historico, ...rest }: any) => rest
      );
      await supabase.from('report_event_snapshots').insert(eventSnapshotsForDb);
    }

    // Generate PDF content
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = monthNames[month - 1];

    // Calculate loan KPIs for lite report (separate by currency, convert USD to ARS)
    const totalActiveLoans = loans.length;
    const totalLoanAmountARS = loans.filter((l: any) => l.account !== 'savings').reduce((sum: number, l: any) => sum + Number(l.amount), 0);
    const totalLoanAmountUSD = loans.filter((l: any) => l.account === 'savings').reduce((sum: number, l: any) => sum + Number(l.amount), 0);
    const totalLoanAmount = totalLoanAmountARS + (totalLoanAmountUSD * exchangeRate);
    const totalLoanDueARS = loans.filter((l: any) => l.account !== 'savings').reduce((sum: number, l: any) => sum + (Number(l.amount) - Number(l.amount_paid)), 0);
    const totalLoanDueUSD = loans.filter((l: any) => l.account === 'savings').reduce((sum: number, l: any) => sum + (Number(l.amount) - Number(l.amount_paid)), 0);
    const totalLoanDue = totalLoanDueARS + (totalLoanDueUSD * exchangeRate);

    // Cambio 4: Rendimiento de cuenta (account_yield)
    const yieldMonthARS = transactions
      .filter((t: any) => t.category === 'account_yield' && t.account !== 'savings')
      .reduce((sum: number, t: any) => sum + (t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
    const yieldMonthUSD = transactions
      .filter((t: any) => t.category === 'account_yield' && t.account === 'savings')
      .reduce((sum: number, t: any) => sum + (t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);

    const yearStartStr = `${year}-01-01`;
    const yieldYearARS = allTransactions
      .filter((t: any) => t.category === 'account_yield' && t.account !== 'savings' && t.transaction_date >= yearStartStr)
      .reduce((sum: number, t: any) => sum + (t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
    const yieldYearUSD = allTransactions
      .filter((t: any) => t.category === 'account_yield' && t.account === 'savings' && t.transaction_date >= yearStartStr)
      .reduce((sum: number, t: any) => sum + (t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);

    // Calculate initial balances (before this month)
    const preMonthTransactions = allTransactions.filter((t: any) => t.transaction_date < monthStartStr);
    const preMonthTransfers = allTransfers.filter((t: any) => t.transfer_date < monthStartStr);
    
    let initialBankBalance = 0;
    let initialGLBalance = 0;
    let initialSavingsBalance = 0;
    
    preMonthTransactions.forEach((t: any) => {
      const amount = t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount);
      if (t.account === 'bank') initialBankBalance += amount;
      else if (t.account === 'great_lodge') initialGLBalance += amount;
      else if (t.account === 'savings') initialSavingsBalance += amount;
    });
    
    preMonthTransfers.forEach((t: any) => {
      const amt = Number(t.amount);
      if (t.from_account === 'bank') initialBankBalance -= amt;
      else if (t.from_account === 'great_lodge') initialGLBalance -= amt;
      else if (t.from_account === 'savings') initialSavingsBalance -= amt;
      if (t.to_account === 'bank') initialBankBalance += amt;
      else if (t.to_account === 'great_lodge') initialGLBalance += amt;
      else if (t.to_account === 'savings') initialSavingsBalance += amt;
    });
    
    const initialARS = initialBankBalance + initialGLBalance;
    const initialUSD = initialSavingsBalance;

    // Build category flow breakdown from this month's transactions
    const categoryLabels: Record<string, string> = {
      monthly_fee: 'Cápita Mensual',
      extraordinary_income: 'Ingreso Extraordinario',
      donation: 'Donación',
      reimbursement: 'Reembolso',
      event_expense: 'Gasto de Evento',
      parent_organization_fee: 'Pago Gran Logia',
      other_expense: 'Otro Gasto',
      other_income: 'Otro Ingreso',
      event_payment: 'Pago de Evento',
      loan_disbursement: 'Desembolso Préstamo',
      loan_repayment: 'Pago Préstamo',
      account_yield: 'Rendimiento de Cuenta',
    };

    const categoryFlows: Record<string, { incomeARS: number; incomeUSD: number; expenseARS: number; expenseUSD: number }> = {};
    transactions.forEach((t: any) => {
      // event_expense AND event_payment transactions are rendered grouped
      // per-event below the category table. other_expense is rendered as
      // individual rows (with expense_summary) right after the event
      // block. All three are skipped here to avoid double counting.
      if (
        t.category === 'event_expense' ||
        t.category === 'event_payment' ||
        t.category === 'other_expense'
      ) return;
      const cat = t.category as string;
      if (!categoryFlows[cat]) categoryFlows[cat] = { incomeARS: 0, incomeUSD: 0, expenseARS: 0, expenseUSD: 0 };
      const isUSD = t.account === 'savings';
      if (t.transaction_type === 'income') {
        if (isUSD) categoryFlows[cat].incomeUSD += Number(t.amount);
        else categoryFlows[cat].incomeARS += Number(t.amount);
      } else {
        if (isUSD) categoryFlows[cat].expenseUSD += Number(t.amount);
        else categoryFlows[cat].expenseARS += Number(t.amount);
      }
    });

    // Individual "Otro Gasto" rows for the flujo de mes, sorted by date.
    // Each row uses the optional expense_summary as the detail; "(sin
    // resumen)" if the treasurer didn't fill one in.
    const otherExpenseRows = transactions
      .filter((t: any) => t.category === 'other_expense')
      .map((t: any) => ({
        date: t.transaction_date,
        summary: (t.expense_summary as string | null) ?? null,
        amount: Number(t.amount),
        currency: t.account === 'savings' ? 'USD' : 'ARS' as 'ARS' | 'USD',
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Per-event movement rows for the flujo de mes. Grouped by event,
    // sorted alphabetically. For each event with activity we emit:
    //   1. one aggregated "Abono Cuota Evento - <name>" row (if any cuota came in)
    //   2. one row per individual event_expense with date + short summary
    // Events with no event_id (legacy data) bucket under "Sin evento".
    const eventNameById = new Map<string, string>(
      eligibleEventsForReport.map((e: any) => [e.id as string, e.name as string])
    );
    const SIN_EVENTO_KEY = '__sin_evento__';
    const cuotaByEvent = new Map<string, { ars: number; usd: number }>();
    const expensesByEvent = new Map<string, Array<{
      date: string;
      summary: string | null;
      amount: number;
      currency: 'ARS' | 'USD';
    }>>();
    transactions.forEach((t: any) => {
      if (t.category === 'event_payment') {
        const key = (t.event_id as string | null) ?? SIN_EVENTO_KEY;
        const acc = cuotaByEvent.get(key) ?? { ars: 0, usd: 0 };
        if (t.account === 'savings') acc.usd += Number(t.amount);
        else acc.ars += Number(t.amount);
        cuotaByEvent.set(key, acc);
      } else if (t.category === 'event_expense') {
        const key = (t.event_id as string | null) ?? SIN_EVENTO_KEY;
        const arr = expensesByEvent.get(key) ?? [];
        arr.push({
          date: t.transaction_date,
          summary: (t.expense_summary as string | null) ?? null,
          amount: Number(t.amount),
          currency: t.account === 'savings' ? 'USD' : 'ARS',
        });
        expensesByEvent.set(key, arr);
      }
    });

    const allEventKeys = Array.from(new Set([
      ...cuotaByEvent.keys(),
      ...expensesByEvent.keys(),
    ]));
    const eventsSortedByName = allEventKeys
      .map((id) => ({
        id,
        name: id === SIN_EVENTO_KEY ? 'Sin evento' : (eventNameById.get(id) ?? 'Evento desconocido'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const eventMovementRows: Array<{
      type: 'cuota' | 'expense';
      event_name: string;
      summary: string | null;
      income_ars: number;
      income_usd: number;
      expense_ars: number;
      expense_usd: number;
    }> = [];
    for (const ev of eventsSortedByName) {
      const cuota = cuotaByEvent.get(ev.id);
      if (cuota && (cuota.ars > 0 || cuota.usd > 0)) {
        eventMovementRows.push({
          type: 'cuota',
          event_name: ev.name,
          summary: null,
          income_ars: cuota.ars,
          income_usd: cuota.usd,
          expense_ars: 0,
          expense_usd: 0,
        });
      }
      const expenses = expensesByEvent.get(ev.id) ?? [];
      expenses.sort((a, b) => a.date.localeCompare(b.date));
      for (const ex of expenses) {
        eventMovementRows.push({
          type: 'expense',
          event_name: ev.name,
          summary: ex.summary,
          income_ars: 0,
          income_usd: 0,
          expense_ars: ex.currency === 'ARS' ? ex.amount : 0,
          expense_usd: ex.currency === 'USD' ? ex.amount : 0,
        });
      }
    }

    // Per-event detail blocks (rendered as a new section after the events
    // summary table). One block per event with activity this month
    // (cuota income > 0 OR any event_expense).
    const perEventDetails = eligibleEventsForReport
      .map((event: any) => {
        const eventTxs = transactions.filter((t: any) => t.event_id === event.id);
        const expenseTxs = eventTxs.filter((t: any) => t.category === 'event_expense');
        const cuotaTxs = eventTxs.filter((t: any) => t.category === 'event_payment');
        const cuotaCollectedARS = cuotaTxs
          .filter((t: any) => t.account !== 'savings')
          .reduce((s: number, t: any) => s + Number(t.amount), 0);
        const cuotaCollectedUSD = cuotaTxs
          .filter((t: any) => t.account === 'savings')
          .reduce((s: number, t: any) => s + Number(t.amount), 0);
        const participants = eventPayments.filter((ep: any) => ep.event_id === event.id);
        const memberCount = participants.filter((ep: any) => ep.member_id !== null).length;
        const guestCount = participants.filter((ep: any) => ep.guest_name !== null).length;
        return {
          event_id: event.id,
          event_name: event.name as string,
          cuota_collected_ars: cuotaCollectedARS,
          cuota_collected_usd: cuotaCollectedUSD,
          member_count: memberCount,
          guest_count: guestCount,
          expenses: expenseTxs
            .map((t: any) => ({
              date: t.transaction_date,
              summary: (t.expense_summary as string | null) || '',
              description: (t.notes as string | null) || '',
              amount: Number(t.amount),
              currency: t.account === 'savings' ? 'USD' : 'ARS',
            }))
            .sort((a: any, b: any) => a.date.localeCompare(b.date)),
          has_activity: cuotaCollectedARS > 0 || cuotaCollectedUSD > 0 || expenseTxs.length > 0,
        };
      })
      .filter((d: any) => d.has_activity);

    // Also account for transfers in/out this month
    const monthTransfers = allTransfers.filter((t: any) => t.transfer_date >= monthStartStr && t.transfer_date <= monthEndStr);

    // Officer names for the signature block. The head (VM) and Tesorero are app
    // ROLES ('vm' / 'treasurer'), not lodge offices. Resolve robustly across
    // contexts, in order: (1) get_users_with_roles on the caller's session (when
    // a user triggered generation); (2) a SERVICE-ROLE path so the sessionless
    // scheduled/cron job also resolves them (user_roles -> member via
    // get_user_member_id); (3) members.lodge_office. Names shown on purpose (the
    // rest of the report is Matrícula-only); blank if unassigned (still signable).
    let usersWithRoles: any[] | null = null;
    try {
      const r = await supabaseAuth.rpc('get_users_with_roles');
      usersWithRoles = (r.data as any[]) || null;
    } catch (_e) { /* no caller session (cron path); fall through */ }
    const svcOfficer: Record<string, string> = {};
    try {
      const { data: roleRows } = await supabase
        .from('user_roles').select('user_id, role').in('role', ['vm', 'treasurer']);
      for (const rr of (roleRows || [])) {
        if (svcOfficer[rr.role]) continue;
        const { data: mid } = await supabase.rpc('get_user_member_id', { _user_id: rr.user_id });
        const mm = members.find((m: any) => m.id === mid);
        if (mm?.full_name) svcOfficer[rr.role] = mm.full_name;
      }
    } catch (_e) { /* ignore; fall through to lodge_office */ }
    const officerName = (role: string, office: string) =>
      ((usersWithRoles || []).find((u: any) => u.role === role)?.member_name)
      || svcOfficer[role]
      || members.find((m: any) => m.lodge_office === office)?.full_name
      || '';
    const vmName = officerName('vm', 'venerable_maestro');
    const tesoreroName = officerName('treasurer', 'tesorero');

    const reportData = {
      year,
      month,
      monthName,
      bankBalance,
      greatLodgeBalance,
      savingsBalance,
      totalARSBalance,
      exchangeRate,
      totalInflows,
      totalOutflows,
      netResult,
      outstandingMemberDebt,
      prepaidMemberCredit,
      expectedMonthlyFees,
      collectedMonthlyFees,
      collectionPercentage,
      membersMissingPayment,
      memberSnapshots,
      loanSnapshots,
      eventSnapshots,
      // Loan KPIs for lite report
      totalActiveLoans,
      totalLoanAmount,
      totalLoanDue,
      totalLoanAmountUSD,
      totalLoanDueUSD,
      // Yield KPIs
      yieldMonthARS,
      yieldMonthUSD,
      yieldYearARS,
      yieldYearUSD,
      // Category flows
      categoryFlows,
      categoryLabels,
      eventMovementRows,
      otherExpenseRows,
      perEventDetails,
      initialARS,
      initialUSD,
      monthTransfers,
      tesoreroName,
      vmName,
    };

    // Fetch logo as base64 for embedding in HTML
    let logoBase64: string | undefined;
    try {
      const { data: logoData } = await supabase.storage
        .from('reports')
        .download('assets/lodge-logo.png');
      
      if (logoData) {
        const arrayBuffer = await logoData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        logoBase64 = btoa(binary);
        console.log('Logo loaded successfully');
      }
    } catch (e) {
      console.warn('Failed to load logo:', e);
    }

    // Generate comprehensive report
    const pdfContent = generatePDFHTML(reportData, 'comprehensive', logoBase64);
    
    // Generate lite report
    const liteContent = generatePDFHTML(reportData, 'lite', logoBase64);

    // Running header & footer rendered by PDFShift on every page (page 1
    // skips the running header; the big main header already lives there).
    // <span class="pageNumber"></span> / <span class="totalPages"></span>
    // are Chromium placeholders that PDFShift fills in per page.
    const logoForHeader = logoBase64
      ? `<img src="data:image/png;base64,${logoBase64}" style="width: 28px; height: auto; vertical-align: middle;" />`
      : '';
    const reportTitleFormatted = `REPORTE FINANCIERO MENSUAL ${monthName.toUpperCase()} ${year}`;
    const runningHeaderHtml = `
      <div style="font-size: 9px; color: #000; width: 100%; padding: 0 8mm; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #999;">
        <div style="min-width: 35mm;">${logoForHeader}</div>
        <div style="flex: 1; text-align: center;"><strong>R.·.L.·. Simón Bolívar N° 646</strong> · ${reportTitleFormatted}</div>
        <div style="min-width: 35mm; text-align: right;">${monthName} ${year}</div>
      </div>
    `;
    const runningFooterHtml = `
      <div style="font-size: 8px; color: #000; width: 100%; padding: 0 8mm; box-sizing: border-box; text-align: center; border-top: 1px solid #999;">
        R.·.L.·. Simón Bolívar N° 646 · Tesorería · ${monthName} ${year} · Página <span class="pageNumber"></span> de <span class="totalPages"></span>
      </div>
    `;

    // Convert HTML to PDF via PDFShift. Both reports in parallel.
    const [comprehensivePdf, litePdf] = await Promise.all([
      convertHtmlToPdf({
        html: pdfContent,
        headerHtml: runningHeaderHtml,
        footerHtml: runningFooterHtml,
      }),
      // Lite is single-page; no running header needed but keep a small footer
      // for a page identifier if it ever spills.
      convertHtmlToPdf({
        html: liteContent,
        footerHtml: runningFooterHtml,
        marginTopMm: 8,
      }),
    ]);

    // Upload PDFs to storage. Filenames mirror the <title> convention so
    // the signed URL surface a sensible default download name.
    const monthPad = month.toString().padStart(2, '0');
    const pdfPath = `${year}/${monthPad}/RLSB646_Reporte_Mensual_${year}-${monthPad}_${monthName}_Completo.pdf`;
    const litePdfPath = `${year}/${monthPad}/RLSB646_Reporte_Mensual_${year}-${monthPad}_${monthName}_Resumen.pdf`;

    const [uploadResult, liteUploadResult] = await Promise.all([
      supabase.storage
        .from('reports')
        .upload(pdfPath, comprehensivePdf, {
          contentType: 'application/pdf',
          upsert: true,
        }),
      supabase.storage
        .from('reports')
        .upload(litePdfPath, litePdf, {
          contentType: 'application/pdf',
          upsert: true,
        }),
    ]);

    if (uploadResult.error) {
      console.error('Upload error (comprehensive):', uploadResult.error);
      throw uploadResult.error;
    }

    if (liteUploadResult.error) {
      console.error('Upload error (lite):', liteUploadResult.error);
      throw liteUploadResult.error;
    }

    // Update report with both PDF paths and mark as generated
    // Persist the canonical month result (the same computeMonthResult both PDFs
    // display) so the app's stored Ingresos/Egresos and net_result match the
    // report headline and sum consistently (net_result = inflows - outflows).
    const canonicalMonthResult = computeMonthResult(reportData);
    await supabase
      .from('monthly_reports')
      .update({
        status: 'generated',
        generated_at: new Date().toISOString(),
        pdf_path: pdfPath,
        lite_pdf_path: litePdfPath,
        total_inflows: canonicalMonthResult.ingresosEquiv,
        total_outflows: canonicalMonthResult.egresosEquiv,
        net_result: canonicalMonthResult.equivArs,
      })
      .eq('id', reportId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reportId,
        pdfPath,
        litePdfPath,
        message: `Reporte generado para ${monthName} ${year}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error generating report';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Canonical month result. Sums the SAME legs the flujo-del-mes table renders
 * (categoryFlows + eventMovementRows + otherExpenseRows), per currency, so the
 * Completo ledger, its reconciling "Resultado del Mes (equiv. ARS)" row, the
 * Resumen headline, and the persisted net_result all agree by construction.
 * equivArs folds the USD leg at the single per-run exchangeRate (fallback 1200).
 */
function computeMonthResult(data: any): {
  incARS: number; incUSD: number; expARS: number; expUSD: number;
  monthARS: number; monthUSD: number;
  ingresosEquiv: number; egresosEquiv: number; equivArs: number;
} {
  let incARS = 0, incUSD = 0, expARS = 0, expUSD = 0;
  const flows = data.categoryFlows || {};
  for (const cat of Object.keys(flows)) {
    const f = flows[cat];
    incARS += Number(f.incomeARS || 0);
    incUSD += Number(f.incomeUSD || 0);
    expARS += Number(f.expenseARS || 0);
    expUSD += Number(f.expenseUSD || 0);
  }
  for (const row of (data.eventMovementRows || [])) {
    incARS += Number(row.income_ars || 0);
    incUSD += Number(row.income_usd || 0);
    expARS += Number(row.expense_ars || 0);
    expUSD += Number(row.expense_usd || 0);
  }
  for (const row of (data.otherExpenseRows || [])) {
    if (row.currency === 'USD') expUSD += Number(row.amount || 0);
    else expARS += Number(row.amount || 0);
  }
  const rate = Number(data.exchangeRate) || 1200;
  const monthARS = incARS - expARS;
  const monthUSD = incUSD - expUSD;
  return {
    incARS, incUSD, expARS, expUSD, monthARS, monthUSD,
    ingresosEquiv: incARS + incUSD * rate,
    egresosEquiv: expARS + expUSD * rate,
    equivArs: monthARS + monthUSD * rate,
  };
}

function buildFlowTable(data: any, formatCurrency: (amount: number, currency?: string) => string): string {
  // Order categories: loan_disbursement before loan_repayment
  const categoryOrder = [
    'monthly_fee', 'extraordinary_income', 'donation', 'reimbursement',
    'event_expense', 'parent_organization_fee', 'other_expense', 'other_income',
    'event_payment', 'account_yield', 'loan_disbursement', 'loan_repayment',
  ];
  const allCats = Object.keys(data.categoryFlows || {});
  const cats = categoryOrder.filter(c => allCats.includes(c)).concat(allCats.filter(c => !categoryOrder.includes(c)));
  let totalIncARS = 0, totalIncUSD = 0, totalExpARS = 0, totalExpUSD = 0;
  
  const catRows = cats.map((cat: string) => {
    const f = data.categoryFlows[cat];
    totalIncARS += f.incomeARS;
    totalIncUSD += f.incomeUSD;
    totalExpARS += f.expenseARS;
    totalExpUSD += f.expenseUSD;
    const label = data.categoryLabels[cat] || cat;
    return '<tr>'
      + '<td>' + label + '</td>'
      + '<td class="text-right ' + (f.incomeARS > 0 ? 'positive' : '') + '">' + (f.incomeARS > 0 ? formatCurrency(f.incomeARS) : '-') + '</td>'
      + '<td class="text-right ' + (f.incomeUSD > 0 ? 'positive' : '') + '">' + (f.incomeUSD > 0 ? formatCurrency(f.incomeUSD, 'USD') : '-') + '</td>'
      + '<td class="text-right ' + (f.expenseARS > 0 ? 'negative' : '') + '">' + (f.expenseARS > 0 ? formatCurrency(f.expenseARS) : '-') + '</td>'
      + '<td class="text-right ' + (f.expenseUSD > 0 ? 'negative' : '') + '">' + (f.expenseUSD > 0 ? formatCurrency(f.expenseUSD, 'USD') : '-') + '</td>'
      + '</tr>';
  }).join('');

  // Individual rows for other_expense transactions (sorted by date),
  // each tagged with its short summary. Replaces the previous aggregated
  // "Otro Gasto" row.
  const otherExpenseRowsHtml = (data.otherExpenseRows || []).map((row: any) => {
    const hasSummary = row.summary && row.summary.trim().length > 0;
    const concepto = hasSummary ? `Otro Gasto - ${row.summary}` : 'Otro Gasto';
    const isUSD = row.currency === 'USD';
    if (isUSD) totalExpUSD += row.amount;
    else totalExpARS += row.amount;
    return '<tr>'
      + '<td>' + concepto + '</td>'
      + '<td class="text-right">-</td>'
      + '<td class="text-right">-</td>'
      + '<td class="text-right ' + (!isUSD ? 'negative' : '') + '">' + (!isUSD ? formatCurrency(row.amount) : '-') + '</td>'
      + '<td class="text-right ' + (isUSD ? 'negative' : '') + '">' + (isUSD ? formatCurrency(row.amount, 'USD') : '-') + '</td>'
      + '</tr>';
  }).join('');

  // Transfers between owned accounts (account_transfers) are a wash at
  // the organization level; same money moving between cuentas. They
  // shouldn't appear in the category-flow table since they have zero
  // net impact on total holdings. Per-account balances are still
  // computed correctly elsewhere using the same transfers data.
  const transferRow = '';

  // Per-event movement rows. Each event's cuota aggregate row and its
  // individual gasto rows are grouped together (cuota first, then gastos
  // sorted by date). Events are alphabetical so the same event always
  // sits in the same place across reports.
  //   Abono Cuota Evento - "<event name>"           (income)
  //   Gasto Evento - "<event name>" - <summary>     (expense)
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const eventRows = (data.eventMovementRows || []).map((row: any) => {
    const eventNameTrunc = truncate(row.event_name, 40);
    let concepto: string;
    if (row.type === 'cuota') {
      concepto = `Abono Cuota Evento - "${eventNameTrunc}"`;
    } else {
      const hasSummary = row.summary && String(row.summary).trim().length > 0;
      concepto = hasSummary
        ? `Gasto Evento - "${eventNameTrunc}" - ${row.summary}`
        : `Gasto Evento - "${eventNameTrunc}"`;
    }
    totalIncARS += Number(row.income_ars || 0);
    totalIncUSD += Number(row.income_usd || 0);
    totalExpARS += Number(row.expense_ars || 0);
    totalExpUSD += Number(row.expense_usd || 0);
    const incARS = Number(row.income_ars || 0);
    const incUSD = Number(row.income_usd || 0);
    const expARS = Number(row.expense_ars || 0);
    const expUSD = Number(row.expense_usd || 0);
    return '<tr>'
      + '<td>' + concepto + '</td>'
      + '<td class="text-right ' + (incARS > 0 ? 'positive' : '') + '">' + (incARS > 0 ? formatCurrency(incARS) : '-') + '</td>'
      + '<td class="text-right ' + (incUSD > 0 ? 'positive' : '') + '">' + (incUSD > 0 ? formatCurrency(incUSD, 'USD') : '-') + '</td>'
      + '<td class="text-right ' + (expARS > 0 ? 'negative' : '') + '">' + (expARS > 0 ? formatCurrency(expARS) : '-') + '</td>'
      + '<td class="text-right ' + (expUSD > 0 ? 'negative' : '') + '">' + (expUSD > 0 ? formatCurrency(expUSD, 'USD') : '-') + '</td>'
      + '</tr>';
  }).join('');

  const finalARS = data.initialARS + totalIncARS - totalExpARS;
  const finalUSD = data.initialUSD + totalIncUSD - totalExpUSD;

  return '<table>'
    + '<thead><tr>'
    + '<th>Concepto</th>'
    + '<th class="text-right">Ingresos ARS</th>'
    + '<th class="text-right">Ingresos USD</th>'
    + '<th class="text-right">Egresos ARS</th>'
    + '<th class="text-right">Egresos USD</th>'
    + '</tr></thead>'
    + '<tbody>'
    + '<tr class="summary-row">'
    + '<td>Balance Inicial</td>'
    + '<td class="text-right">' + formatCurrency(data.initialARS) + '</td>'
    + '<td class="text-right">' + formatCurrency(data.initialUSD, 'USD') + '</td>'
    + '<td class="text-right">-</td>'
    + '<td class="text-right">-</td>'
    + '</tr>'
    + catRows
    + eventRows
    + otherExpenseRowsHtml
    + transferRow
    + '<tr class="summary-row">'
    + '<td>Total Movimientos</td>'
    + '<td class="text-right positive">' + formatCurrency(totalIncARS) + '</td>'
    + '<td class="text-right positive">' + formatCurrency(totalIncUSD, 'USD') + '</td>'
    + '<td class="text-right negative">' + formatCurrency(totalExpARS) + '</td>'
    + '<td class="text-right negative">' + formatCurrency(totalExpUSD, 'USD') + '</td>'
    + '</tr>'
    // Balance del Mes = ingresos - egresos del mes (sin contar el balance
    // inicial). Resultado neto del mes; útil para ver si el mes fue
    // superavitario o deficitario sin tener que restar mentalmente.
    + (() => {
        const monthBalanceARS = totalIncARS - totalExpARS;
        const monthBalanceUSD = totalIncUSD - totalExpUSD;
        return '<tr class="summary-row">'
          + '<td>Balance del Mes</td>'
          + '<td class="text-right ' + (monthBalanceARS >= 0 ? 'positive' : 'negative') + '">' + formatCurrency(monthBalanceARS) + '</td>'
          + '<td class="text-right ' + (monthBalanceUSD >= 0 ? 'positive' : 'negative') + '">' + formatCurrency(monthBalanceUSD, 'USD') + '</td>'
          + '<td class="text-right">-</td>'
          + '<td class="text-right">-</td>'
          + '</tr>';
      })()
    // Reconciling line: the month result folded to a single equiv-ARS figure
    // (USD converted at TC Oficial). This is the SAME number the Resumen
    // headline shows, so the two documents agree on the month's bottom line.
    + (() => {
        const mr = computeMonthResult(data);
        return '<tr class="summary-row">'
          + '<td>Resultado del Mes (equiv. ARS)</td>'
          + '<td class="text-right ' + (mr.equivArs >= 0 ? 'positive' : 'negative') + '" colspan="4"><strong>' + formatCurrency(mr.equivArs) + '</strong></td>'
          + '</tr>';
      })()
    + '<tr class="summary-row">'
    + '<td><strong>Balance Final</strong></td>'
    + '<td class="text-right ' + (finalARS >= 0 ? 'positive' : 'negative') + '"><strong>' + formatCurrency(finalARS) + '</strong></td>'
    + '<td class="text-right ' + (finalUSD >= 0 ? 'positive' : 'negative') + '"><strong>' + formatCurrency(finalUSD, 'USD') + '</strong></td>'
    + '<td class="text-right">-</td>'
    + '<td class="text-right">-</td>'
    + '</tr>'
    + '</tbody></table>';
}

// Direction 3 visual system, applied after the base styles so it wins the
// cascade in both variants: an embedded heritage serif on the masthead, warm
// paper, printerly green/oxblood that survive grayscale, quiet section labels
// on a hairline rule (dark fill stays only on table th), and the verdict hero.
const MASTHEAD_STYLE = `
    @font-face{font-family:'HeritageSerif';font-style:normal;font-weight:400 700;font-display:swap;src:url(data:font/woff2;base64,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) format('woff2');}
    .header-invocation, .header-lodge, .header-title h1 { font-family: 'HeritageSerif', Georgia, 'Times New Roman', serif; }
    body { background: #ffffff; }
    .positive { color: #1F6B3B; }
    .negative { color: #A32219; }
    .stat-card.success { border-left-color: #1F6B3B; }
    .stat-card.danger { border-left-color: #A32219; }
    .section-title { background: transparent; color: #1a1a1a; border-radius: 0; border-bottom: 1.5px solid #C9A24B; padding: 4px 0 3px; letter-spacing: 1.5px; text-transform: uppercase; }
    .verdict-hero { border: 1px solid #E4DFD2; border-left: 4px solid #C9A24B; border-radius: 4px; padding: 12px 16px; margin: 0 0 14px; background: #fff; }
    .verdict-hero .verdict-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b6b6b; margin-bottom: 2px; }
    .verdict-hero .verdict-figure { font-size: 30px; line-height: 1.1; font-weight: bold; font-family: 'HeritageSerif', Georgia, serif; }
    .verdict-hero.pos .verdict-figure { color: #1F6B3B; }
    .verdict-hero.neg .verdict-figure { color: #A32219; }
    .verdict-hero .verdict-support { font-size: 10px; color: #6b6b6b; margin-top: 5px; }
    .verdict-hero .verdict-support strong { color: #1a1a1a; font-weight: 600; }
    .verdict-hero .verdict-support span { margin-right: 18px; }
    .signatures { display: flex; justify-content: space-around; gap: 40px; margin-top: 40px; page-break-inside: avoid; }
    .signatures .sig { flex: 1; max-width: 45%; text-align: center; }
    .signatures .sig-line { border-top: 1px solid #1a1a1a; margin-top: 44px; padding-top: 6px; }
    .signatures .sig-name { font-weight: bold; font-size: 12px; color: #1a1a1a; }
    .signatures .sig-role { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 1px; }
    /* Keep each stat-card grid intact across page breaks (Chromium honors
       break-inside:avoid on grid containers, verified). Fixes the "Posición de
       Miembros" grid splitting across an A4 page. */
    .grid { break-inside: avoid; page-break-inside: avoid; }
    /* Keep a subsection heading with the block that follows it (no orphaned
       "Saldos de Cuentas" / "Flujo del Mes" title at a page bottom). */
    .subsection-title { break-after: avoid; page-break-after: avoid; }
  `;

function generatePDFHTML(data: any, reportType: 'comprehensive' | 'lite' = 'comprehensive', logoBase64?: string): string {
  const isLite = reportType === 'lite';
  // Canonical month result, shared by the Resumen headline and the Completo
  // reconciling row so both variants show the same bottom line.
  const mr = computeMonthResult(data);
  
  const formatCurrency = (amount: number, currency = 'ARS') => {
    // Accounting-style negatives: parentheses instead of a leading minus, so the
    // sign survives grayscale printing and colour-blind reading (a second channel
    // beyond the red/green colour).
    const formatted = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'ARS',
      minimumFractionDigits: 2,
    }).format(Math.abs(amount));
    return amount < 0 ? `(${formatted})` : formatted;
  };

  const feeTypeLabels: Record<string, string> = {
    standard: 'Estándar',
    solidarity: 'Solidaria',
  };

  const statusLabels: Record<string, string> = {
    up_to_date: 'Al día',
    ahead: 'Adelantado',
    overdue: 'Demorado',
    unpaid: 'Impago',
  };

  const accountLabels: Record<string, string> = {
    bank: 'Banco (ARS)',
    great_lodge: 'Cuenta GL (ARS)',
    savings: 'Ahorros (USD)',
  };

  // Spanish month names for date formatting
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Dateline: the first calendar day AFTER the report month ends (a Junio report
  // is dated "1 de Julio"), so the date is deterministic and reflects the period
  // close, not the moment the PDF happened to be generated. data.month is
  // 1-based, so data.month % 12 already indexes the next month (Junio 6 -> 6 =
  // Julio; Diciembre 12 -> 0 = Enero of the next year).
  const dsMonthIndex = data.month % 12;
  const dsYear = data.month === 12 ? data.year + 1 : data.year;
  const formattedDate = `Or.·. de Buenos Aires, 1 de ${monthNames[dsMonthIndex]} del ${dsYear} (E.·.V.·.)`;

  // Report title format
  const reportTitleFormatted = `REPORTE FINANCIERO MENSUAL ${data.monthName.toUpperCase()} ${data.year}`;

  // Sort members by status priority: overdue first, then unpaid, then by balance
  const sortedMembers = [...data.memberSnapshots].sort((a: any, b: any) => {
    const statusPriority: Record<string, number> = { overdue: 0, unpaid: 1, up_to_date: 2, ahead: 3 };
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
    if (priorityDiff !== 0) return priorityDiff;
    return a.balance_at_month_end - b.balance_at_month_end;
  });

  // For lite report, skip member detail section entirely
  const membersToShow = isLite 
    ? [] // Lite report doesn't show member details
    : sortedMembers;
  
  // Section numbers derive from render order (Préstamos, Eventos, and the
  // Completo-only Detalle de Miembros are all conditional) so the printed
  // number always matches the page position. Order: 1 Resumen Global, 2
  // Cobranza, then Préstamos, Eventos (+ its 4.1 Detalle por Evento), and
  // Detalle Financiero de Miembros last. Fixes the old 1,2,3,5,5.1,4 drift.
  const hasLoansSection = isLite ? (data.totalActiveLoans > 0) : (data.loanSnapshots.length > 0);
  const hasEventsSection = data.eventSnapshots.length > 0;
  let sectionCounter = 2;
  const loansSectionNum = hasLoansSection ? String(++sectionCounter) : '';
  const eventsSectionNum = hasEventsSection ? String(++sectionCounter) : '';
  const memberSectionNum = !isLite ? String(++sectionCounter) : '';
  const feeSectionTitle = `2. Cobranza de Cápita`;
  const memberSectionTitle = `${memberSectionNum}. Detalle Financiero de Miembros`;

  // Build member rows; separate Saldo Capita and Saldo Eventos columns.
  const memberRows = membersToShow.map((m: any) => {
    const capita = Number(m.capita_balance ?? m.balance_at_month_end ?? 0);
    const events = Number(m.event_balance ?? 0);
    return `
    <tr>
      <td>${m.phone_number || '-'}</td>
      <td class="text-center">${feeTypeLabels[m.fee_type] || m.fee_type}</td>
      <td class="text-right">${formatCurrency(m.monthly_fee_amount)}</td>
      <td class="text-right ${capita >= 0 ? 'positive' : 'negative'}">${formatCurrency(capita)}</td>
      <td class="text-right ${events >= 0 ? 'positive' : 'negative'}">${formatCurrency(events)}</td>
      <td class="text-center"><span class="status-badge status-${m.status}">${statusLabels[m.status] || m.status}</span></td>
      <td class="text-center">${m.months_ahead > 0 ? `+${m.months_ahead}` : m.months_overdue > 0 ? `-${m.months_overdue}` : '0'}</td>
      <td class="text-center">${m.last_payment_date ? new Date(m.last_payment_date).toLocaleDateString('es-AR') : '-'}</td>
    </tr>
  `;
  }).join('');

  // Build member section
  const memberSection = membersToShow.length > 0
    ? `<table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th class="text-center">Tipo Cuota</th>
            <th class="text-right">Cápita Mensual</th>
            <th class="text-right">Saldo Capita</th>
            <th class="text-right">Saldo Eventos</th>
            <th class="text-center">Estado</th>
            <th class="text-center">Meses</th>
            <th class="text-center">Último Pago</th>
          </tr>
        </thead>
        <tbody>${memberRows}</tbody>
      </table>`
    : `<p style="color: #000; text-align: center;">No hay miembros activos para mostrar este mes.</p>`;

  // Build loans section
  let loansSection = '';
  if (isLite) {
    if (data.totalActiveLoans > 0) {
      const usdNoteAmount = data.totalLoanAmountUSD > 0 ? `<div style="font-size: 8px; color: #000; margin-top: 2px;">Incluye USD ${formatCurrency(data.totalLoanAmountUSD, 'USD')} × ${data.exchangeRate}</div>` : '';
      const usdNoteDue = data.totalLoanDueUSD > 0 ? `<div style="font-size: 8px; color: #000; margin-top: 2px;">Incluye USD ${formatCurrency(data.totalLoanDueUSD, 'USD')} × ${data.exchangeRate}</div>` : '';
      loansSection = `
        <div class="section">
          <h2 class="section-title">${loansSectionNum}. Préstamos Activos (Resumen)</h2>
          <div class="grid">
            <div class="stat-card">
              <div class="stat-label">Cantidad de Préstamos Activos</div>
              <div class="stat-value">${data.totalActiveLoans}</div>
            </div>
            <div class="stat-card warning">
              <div class="stat-label">Monto Total en Préstamos</div>
              <div class="stat-value">${formatCurrency(data.totalLoanAmount)}</div>
              ${usdNoteAmount}
            </div>
            <div class="stat-card danger">
              <div class="stat-label">Monto Pendiente de Cobro</div>
              <div class="stat-value negative">${formatCurrency(data.totalLoanDue)}</div>
              ${usdNoteDue}
            </div>
          </div>
        </div>
      `;
    }
  } else if (data.loanSnapshots.length > 0) {
    const loanRows = data.loanSnapshots.map((l: any) => `
      <tr>
        <td>${l.borrower_matricula || '-'}</td>
        <td class="text-center">${accountLabels[l.account] || l.account}</td>
        <td class="text-right">${formatCurrency(l.original_amount, l.account === 'savings' ? 'USD' : 'ARS')}</td>
        <td class="text-right positive">${formatCurrency(l.amount_paid, l.account === 'savings' ? 'USD' : 'ARS')}</td>
        <td class="text-right negative">${formatCurrency(l.outstanding_balance, l.account === 'savings' ? 'USD' : 'ARS')}</td>
        <td class="text-center">${l.payment_status === 'partial' ? 'Parcial' : l.payment_status === 'pending' ? 'Pendiente' : 'Pagado'}</td>
      </tr>
    `).join('');

    const totalPendingARS = data.loanSnapshots
      .filter((l: any) => l.account !== 'savings')
      .reduce((s: number, l: any) => s + l.outstanding_balance, 0);
    const totalPendingUSD = data.loanSnapshots
      .filter((l: any) => l.account === 'savings')
      .reduce((s: number, l: any) => s + l.outstanding_balance, 0);

    loansSection = `
      <div class="section">
        <h2 class="section-title">${loansSectionNum}. Préstamos Activos</h2>
        <table>
          <thead>
            <tr>
              <th>Matrícula</th>
              <th class="text-center">Cuenta</th>
              <th class="text-right">Monto Original</th>
              <th class="text-right">Pagado</th>
              <th class="text-right">Pendiente</th>
              <th class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${loanRows}
            <tr class="summary-row">
              <td colspan="4" class="text-right">Total Pendiente (ARS)</td>
              <td class="text-right negative">${formatCurrency(totalPendingARS)}</td>
              <td></td>
            </tr>
            <tr class="summary-row">
              <td colspan="4" class="text-right">Total Pendiente (USD)</td>
              <td class="text-right negative">${formatCurrency(totalPendingUSD, 'USD')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // Build events section
  let eventsSection = '';
  if (data.eventSnapshots.length > 0) {
    const eventRows = data.eventSnapshots.map((e: any) => {
      const expensesArs = Number(e.expenses_ars ?? 0);
      const balanceHist = Number(e.balance_historico ?? 0);
      const balanceClass = balanceHist >= 0 ? 'positive' : 'negative';
      return `
      <tr>
        <td>${e.event_name}</td>
        <td class="text-right">${formatCurrency(e.total_amount)}</td>
        <td class="text-right positive">${formatCurrency(e.amount_collected)}</td>
        <td class="text-right negative">${formatCurrency(e.outstanding_amount)}</td>
        <td class="text-right ${expensesArs > 0 ? 'negative' : ''}">${expensesArs > 0 ? formatCurrency(expensesArs) : '-'}</td>
        <td class="text-right ${balanceClass}"><strong>${formatCurrency(balanceHist)}</strong></td>
        <td class="text-center">${e.members_included}</td>
        <td class="text-center">${e.members_unpaid}</td>
        <td class="text-center">${e.event_status === 'settled' ? '<span class="status-badge status-up_to_date">Saldado</span>' : '<span class="status-badge status-overdue">Pendiente</span>'}</td>
      </tr>
    `;
    }).join('');

    const totalEventAmount = data.eventSnapshots.reduce((s: number, e: any) => s + e.total_amount, 0);
    const totalEventCollected = data.eventSnapshots.reduce((s: number, e: any) => s + e.amount_collected, 0);
    const totalEventOutstanding = data.eventSnapshots.reduce((s: number, e: any) => s + e.outstanding_amount, 0);
    const totalEventExpenses = data.eventSnapshots.reduce((s: number, e: any) => s + Number(e.expenses_ars ?? 0), 0);
    const totalEventBalance = data.eventSnapshots.reduce((s: number, e: any) => s + Number(e.balance_historico ?? 0), 0);
    const totalBalanceClass = totalEventBalance >= 0 ? 'positive' : 'negative';

    eventsSection = `
      <div class="section">
        <h2 class="section-title">${eventsSectionNum}. Eventos / Gastos Extraordinarios</h2>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th class="text-right">Total Cuota</th>
              <th class="text-right">Cuota Recaudada</th>
              <th class="text-right">Cuota Pendiente</th>
              <th class="text-right">Gastos del Mes</th>
              <th class="text-right">Balance Histórico</th>
              <th class="text-center">Miembros</th>
              <th class="text-center">Sin Pagar</th>
              <th class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${eventRows}
            <tr class="summary-row">
              <td class="text-right">Totales</td>
              <td class="text-right">${formatCurrency(totalEventAmount)}</td>
              <td class="text-right positive">${formatCurrency(totalEventCollected)}</td>
              <td class="text-right negative">${formatCurrency(totalEventOutstanding)}</td>
              <td class="text-right ${totalEventExpenses > 0 ? 'negative' : ''}">${totalEventExpenses > 0 ? formatCurrency(totalEventExpenses) : '-'}</td>
              <td class="text-right ${totalBalanceClass}"><strong>${formatCurrency(totalEventBalance)}</strong></td>
              <td colspan="3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // Per-event detail blocks: one card per event with activity this month.
  // Cuota collected, member/guest counts, plus a table of individual
  // expenses with their short summary and full description. Lite report
  // skips this; too detailed for the single-page version.
  let perEventDetailsSection = '';
  if (!isLite && Array.isArray(data.perEventDetails) && data.perEventDetails.length > 0) {
    const cardSubNum = `${eventsSectionNum}.1`;
    // Join the per-event detail to its snapshot (which carries the all-time
    // histórico figures) by event name.
    const snapByName = new Map<string, any>(
      (data.eventSnapshots || []).map((s: any) => [s.event_name, s])
    );
    const blocks = data.perEventDetails.map((ev: any) => {
      const expensesTotal = ev.expenses.reduce(
        (acc: { ars: number; usd: number }, x: any) => {
          if (x.currency === 'USD') acc.usd += x.amount;
          else acc.ars += x.amount;
          return acc;
        },
        { ars: 0, usd: 0 }
      );
      const expenseRows = ev.expenses.length === 0
        ? '<tr><td colspan="4" class="text-center" style="color:#666;">Sin gastos registrados este mes.</td></tr>'
        : ev.expenses.map((x: any) => {
            const fecha = new Date(x.transaction_date || x.date).toLocaleDateString('es-AR');
            const summary = x.summary || '(sin resumen)';
            const desc = x.description || '-';
            const monto = x.currency === 'USD' ? formatCurrency(x.amount, 'USD') : formatCurrency(x.amount);
            return '<tr>'
              + `<td>${fecha}</td>`
              + `<td>${summary}</td>`
              + `<td style="font-size: 10px; color: #444;">${desc}</td>`
              + `<td class="text-right negative">${monto}</td>`
              + '</tr>';
          }).join('');
      const expensesFooter = ev.expenses.length === 0 ? '' : `
        <tr class="summary-row">
          <td colspan="3" class="text-right">Total Gastos</td>
          <td class="text-right negative">
            ${expensesTotal.ars > 0 ? formatCurrency(expensesTotal.ars) : ''}
            ${expensesTotal.usd > 0 ? ' / ' + formatCurrency(expensesTotal.usd, 'USD') : ''}
          </td>
        </tr>
      `;
      const cuotaDisplay = [
        ev.cuota_collected_ars > 0 ? formatCurrency(ev.cuota_collected_ars) : null,
        ev.cuota_collected_usd > 0 ? formatCurrency(ev.cuota_collected_usd, 'USD') : null,
      ].filter(Boolean).join(' / ') || formatCurrency(0);
      const snap = snapByName.get(ev.event_name);
      const recH = Number(snap?.recaudado_historico ?? 0);
      const gasH = Number(snap?.gastado_historico ?? 0);
      const balH = Number(snap?.balance_historico ?? (recH - gasH));
      const estadoGeneral = balH >= 0 ? 'Superávit' : 'Déficit';
      return `
        <div class="section" style="page-break-inside: avoid; margin-top: 16px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px;">${ev.event_name}</h3>
          <div class="grid">
            <div class="stat-card">
              <div class="stat-label">Ingresos por Cápita (mes)</div>
              <div class="stat-value positive">${cuotaDisplay}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Miembros Asistiendo</div>
              <div class="stat-value">${ev.member_count}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Invitados Asistiendo</div>
              <div class="stat-value">${ev.guest_count}</div>
            </div>
          </div>
          <div class="subsection-title" style="margin-top: 10px;">Estado General del Evento (histórico)</div>
          <div class="grid">
            <div class="stat-card success">
              <div class="stat-label">Recaudado Histórico</div>
              <div class="stat-value positive">${formatCurrency(recH)}</div>
            </div>
            <div class="stat-card danger">
              <div class="stat-label">Gastado Histórico</div>
              <div class="stat-value negative">${formatCurrency(gasH)}</div>
            </div>
            <div class="stat-card ${balH >= 0 ? 'success' : 'danger'}">
              <div class="stat-label">Balance Histórico</div>
              <div class="stat-value ${balH >= 0 ? 'positive' : 'negative'}">${formatCurrency(balH)}</div>
              <div class="stat-subtext">${estadoGeneral}</div>
            </div>
          </div>
          <table style="margin-top: 8px;">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Resumen</th>
                <th>Descripción detallada</th>
                <th class="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${expenseRows}
              ${expensesFooter}
            </tbody>
          </table>
        </div>
      `;
    }).join('');
    perEventDetailsSection = `
      <div class="section">
        <h2 class="section-title">${cardSubNum} Detalle por Evento</h2>
        ${blocks}
      </div>
    `;
  }

  // Logo HTML - use base64 if available
  const logoHtml = logoBase64 
    ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" class="header-logo" />`
    : '';

  // Different styles for lite vs comprehensive
  const liteStyles = isLite ? `
    /* Lite report - optimized for single page */
    @media print {
      body { margin: 0; padding: 8px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      .page-break { display: none; }
      .no-print { display: none; }
      @page { margin: 8mm 8mm; size: A4; }
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.2;
      color: #1a1a1a;
      max-width: 210mm;
      margin: 0 auto;
      padding: 8px;
      background: #fff;
      font-size: 9px;
    }
    
    .header {
      border-bottom: 1px solid #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    
    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    
    .header-logo { width: 40px; height: auto; }
    
    .header-center { flex: 1; text-align: center; }
    
    .header-invocation {
      font-size: 10px;
      font-weight: bold;
      color: #000;
      letter-spacing: 1px;
    }
    
    .header-right-block { text-align: right; margin-bottom: 4px; }
    
    .header-lodge {
      font-size: 9px;
      font-weight: bold;
      color: #000;
      margin-bottom: 1px;
    }
    
    .header-date { font-size: 8px; font-weight: bold; color: #000; }
    
    .header-title { text-align: center; margin-top: 6px; }
    
    .header-title h1 {
      color: #000;
      margin: 0;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    
    .page-header { display: none; }
    
    .section { margin-bottom: 8px; }
    
    .section-title {
      background: #000;
      color: white;
      padding: 4px 8px;
      margin: 0 0 6px 0;
      border-radius: 2px;
      font-size: 10px;
      font-weight: bold;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    
    .stat-card {
      background: #f9f9f9;
      border-radius: 3px;
      padding: 6px;
      border-left: 3px solid #333;
      border: 1px solid #ddd;
    }
    
    .stat-card.success { border-left: 3px solid #27ae60; }
    .stat-card.warning { border-left: 3px solid #f39c12; }
    .stat-card.danger { border-left: 3px solid #e74c3c; }
    
    .stat-label {
      font-size: 7px;
      color: #000;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    
    .stat-value { font-size: 11px; font-weight: bold; color: #1a1a1a; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8px;
    }
    
    th, td {
      border: 1px solid #999;
      padding: 3px 4px;
      text-align: left;
    }
    
    th { background: #000; color: white; font-size: 7px; font-weight: bold; }
    
    tr:nth-child(even) { background: #f5f5f5; }
    
    .status-badge {
      display: inline-block;
      padding: 1px 4px;
      border-radius: 8px;
      font-size: 7px;
      font-weight: bold;
    }
    
    .status-up_to_date { background: #d4edda; color: #155724; }
    .status-ahead { background: #e0e0e0; color: #333; }
    .status-overdue { background: #f8d7da; color: #721c24; }
    .status-unpaid { background: #fff3cd; color: #856404; }
    
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    
    .positive { color: #27ae60; }
    .negative { color: #e74c3c; }
    
    .footer {
      text-align: center;
      font-size: 7px;
      color: #000;
      padding: 4px;
      border-top: 1px solid #999;
      margin-top: 8px;
    }
    
    @media print {
      .footer { position: relative; margin-top: 10px; }
    }
    
    .print-button {
      position: fixed;
      top: 10px;
      right: 10px;
      background: #1a1a1a;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
    }
    
    .print-button:hover { background: #333; }
    
    .summary-row {
      background: #e8e8e8 !important;
      font-weight: bold;
    }
    
    .subsection-title {
      margin: 8px 0 4px;
      color: #1a1a1a;
      font-size: 9px;
      font-weight: 600;
      border-bottom: 1px solid #ccc;
      padding-bottom: 2px;
    }
    .stat-subtext { font-size: 7px; color: #000; margin-top: 2px; }
  ` : `
    /* Comprehensive report - full styling */
    @media print {
      body { margin: 0; padding: 10px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      .page-break { page-break-before: always; }
      .no-print { display: none; }
      @page { margin: 15mm 15mm; size: A4; }
      @page :first { margin-top: 15mm; }
      /* Table headers repeat when a table is split across pages. */
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { page-break-inside: avoid; }
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.5;
      color: #1a1a1a;
      max-width: 210mm;
      margin: 0 auto;
      padding: 15px;
      background: #fff;
      font-size: 12px;
    }
    
    .header {
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    
    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .header-logo { width: 70px; height: auto; }
    
    .header-center { flex: 1; text-align: center; }
    
    .header-invocation {
      font-size: 14px;
      font-weight: bold;
      color: #000;
      letter-spacing: 2px;
    }
    
    .header-right-block { text-align: right; margin-bottom: 10px; }
    
    .header-lodge {
      font-size: 13px;
      font-weight: bold;
      color: #000;
      margin-bottom: 3px;
    }
    
    .header-date { font-size: 12px; font-weight: bold; color: #000; }
    
    .header-title { text-align: center; margin-top: 8px; }
    
    .header-title h1 {
      color: #000;
      margin: 0;
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    
    .page-header { display: none; }
    .page-footer { display: none; }

    @media print {
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5mm 0 8px 0;
        border-bottom: 1px solid #999;
        margin-bottom: 15px;
        font-size: 10px;
        color: #000;
      }
      .page-header .logo-small { width: 55px; height: auto; }
      .page-footer {
        display: block;
        text-align: center;
        font-size: 9px;
        color: #000;
        border-top: 1px solid #999;
        padding-top: 6px;
        margin-top: 15px;
      }
    }

    /* By default sections try to stay on one page (avoid awkward splits
       of small cards/tables). The .section--splittable modifier opts
       a section in to flowing across pages. */
    .section { margin-bottom: 15px; page-break-inside: avoid; }
    .section.section--splittable { page-break-inside: auto; }
    .section.section--splittable table { page-break-inside: auto; }
    
    .section-title {
      background: #000;
      color: white;
      padding: 6px 12px;
      margin: 0 0 10px 0;
      border-radius: 3px;
      font-size: 13px;
      font-weight: bold;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    
    .stat-card {
      background: #f9f9f9;
      border-radius: 4px;
      padding: 8px 10px;
      border-left: 4px solid #333;
      border: 1px solid #ddd;
    }
    
    .stat-card.success { border-left: 4px solid #27ae60; }
    .stat-card.warning { border-left: 4px solid #f39c12; }
    .stat-card.danger { border-left: 4px solid #e74c3c; }
    
    .stat-label {
      font-size: 10px;
      color: #000;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    
    .stat-value { font-size: 16px; font-weight: bold; color: #1a1a1a; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    
    th, td {
      border: 1px solid #999;
      padding: 8px;
      text-align: left;
    }
    
    th { background: #000; color: white; font-weight: bold; }
    
    tr:nth-child(even) { background: #f5f5f5; }
    
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
    }
    
    .status-up_to_date { background: #d4edda; color: #155724; }
    .status-ahead { background: #e0e0e0; color: #333; }
    .status-overdue { background: #f8d7da; color: #721c24; }
    .status-unpaid { background: #fff3cd; color: #856404; }
    
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    
    .positive { color: #27ae60; }
    .negative { color: #e74c3c; }
    
    .footer {
      text-align: center;
      font-size: 10px;
      color: #000;
      padding: 10px;
      border-top: 1px solid #999;
      margin-top: 20px;
    }
    
    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #1a1a1a;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }
    
    .print-button:hover { background: #333; }
    
    .summary-row {
      background: #e8e8e8 !important;
      font-weight: bold;
    }
    
    .subsection-title {
      margin: 12px 0 6px;
      color: #1a1a1a;
      font-size: 12px;
      font-weight: 600;
      border-bottom: 1px solid #ccc;
      padding-bottom: 3px;
    }
    .stat-subtext { font-size: 9px; color: #000; margin-top: 2px; }
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RLSB646 Reporte Mensual ${data.year}-${String(data.month).padStart(2, '0')} ${data.monthName}${isLite ? ' Resumen' : ' Completo'}</title>
  <style>
    ${liteStyles}
    ${MASTHEAD_STYLE}
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

  <!-- Main Header -->
  <div class="header">
    <div class="header-top">
      ${logoHtml ? `<div class="header-left">${logoHtml}</div>` : '<div class="header-left"></div>'}
      <div class="header-center">
        <div class="header-invocation">A.·.L.·.G.·.D.·.G.·.A.·.D.·.U.·.</div>
      </div>
      <div class="header-left-placeholder" style="width: ${isLite ? '40' : '70'}px;"></div>
    </div>
    <div class="header-right-block">
      <div class="header-lodge">R.·.L.·. Simón Bolívar N° 646</div>
      <div class="header-date">${formattedDate}</div>
    </div>
    <div class="header-title">
      <h1>${reportTitleFormatted}${isLite ? ' (RESUMEN)' : ''}</h1>
    </div>
  </div>

  ${isLite ? `<div class="verdict-hero ${mr.equivArs >= 0 ? 'pos' : 'neg'}">
    <div class="verdict-label">Resultado del Mes</div>
    <div class="verdict-figure">${formatCurrency(mr.equivArs)}</div>
    <div class="verdict-support"><span>Ingresos <strong>${formatCurrency(mr.ingresosEquiv)}</strong></span><span>Egresos <strong>${formatCurrency(mr.egresosEquiv)}</strong></span></div>
  </div>` : ''}

  <!-- Section 1: Global Financial Overview. Marked splittable so it back-fills
       page 1 instead of being ejected whole (which left a near-blank cover). -->
  <div class="section section--splittable">
    <h2 class="section-title">1. Resumen Financiero Global</h2>
    
    <h3 class="subsection-title">Saldos de Cuentas</h3>
    <div class="grid">
      <div class="stat-card ${data.totalARSBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Balance Total (ARS)</div>
        <div class="stat-value">${formatCurrency(data.totalARSBalance)}</div>
        ${isLite ? '' : `<div style="font-size: 10px; color: #000; margin-top: 4px;">TC Oficial: $${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(data.exchangeRate)} por USD</div>`}
      </div>
      <div class="stat-card ${data.bankBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta Bancaria (ARS)</div>
        <div class="stat-value">${formatCurrency(data.bankBalance)}</div>
      </div>
      <div class="stat-card ${data.greatLodgeBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta GL (ARS)</div>
        <div class="stat-value">${formatCurrency(data.greatLodgeBalance)}</div>
      </div>
    </div>
    ${isLite ? '' : `<div class="grid" style="margin-top: 8px; grid-template-columns: 1fr;">
      <div class="stat-card ${data.savingsBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta de Ahorros (USD)</div>
        <div class="stat-value">${formatCurrency(data.savingsBalance, 'USD')}</div>
        <div style="font-size: 11px; color: #000; margin-top: 4px;">Equivalente en ARS: ${formatCurrency(data.savingsBalance * data.exchangeRate)}</div>
      </div>
    </div>`}

    ${isLite ? '' : `<h3 class="subsection-title">Flujo del Mes</h3>${buildFlowTable(data, formatCurrency)}`}

    <h3 class="subsection-title">Posición de Miembros</h3>
    <div class="grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="stat-card danger">
        <div class="stat-label">Deuda Pendiente</div>
        <div class="stat-value negative">${formatCurrency(data.outstandingMemberDebt)}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Crédito Prepagado</div>
        <div class="stat-value positive">${formatCurrency(data.prepaidMemberCredit)}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Con Saldo de Cápita</div>
        <div class="stat-value" style="color: #f39c12;">${data.memberSnapshots.filter((m: any) => m.status === 'unpaid' || m.status === 'overdue').length}</div>
        <div class="stat-subtext">Saldo de cápita pendiente (acumulado)</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-label">Miembros Demorados</div>
        <div class="stat-value negative">${data.memberSnapshots.filter((m: any) => m.status === 'overdue').length}</div>
        <div class="stat-subtext">Más de 1 cuota pendiente</div>
      </div>
    </div>

  </div>

  <!-- Section 2: Monthly Fee Coverage (on page 1) -->
  <div class="section">
    <h2 class="section-title">${feeSectionTitle}</h2>
    <div class="grid">
      <div class="stat-card">
        <div class="stat-label">Cápita Esperada</div>
        <div class="stat-value">${formatCurrency(data.expectedMonthlyFees)}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Cápita Recaudada</div>
        <div class="stat-value">${formatCurrency(data.collectedMonthlyFees)}</div>
      </div>
      <div class="stat-card ${data.collectionPercentage >= 80 ? 'success' : data.collectionPercentage >= 50 ? 'warning' : 'danger'}">
        <div class="stat-label">% Recaudación</div>
        <div class="stat-value">${data.collectionPercentage}%</div>
      </div>
    </div>
    ${isLite ? '' : `<p style="margin-top: 15px; color: #000;">
      <strong>${data.membersMissingPayment}</strong> ${data.membersMissingPayment === 1 ? 'miembro' : 'miembros'} sin ningún pago de cápita registrado este mes.
    </p>`}
  </div>

  <!-- Section 3: Loans (on page 1) -->
  ${loansSection}

  ${eventsSection}

  ${perEventDetailsSection}

  ${isLite ? '' : `<!-- Page break before the member roster. The running header on
       pages 2+ is supplied by PDFShift (start_at:2); no in-body masthead here,
       which previously double-stacked a second header on page 4. -->
  <div class="page-break"></div>`}

  ${isLite ? '' : `<!-- Section 4: Member Financial Detail, marked splittable so
       a long member list flows across pages instead of leaving a
       half-empty page above it. Column headers repeat on each new
       page thanks to thead { display: table-header-group }. -->
  <div class="section section--splittable">
    <h2 class="section-title">${memberSectionTitle}</h2>
    ${memberSection}
  </div>`}

  <div class="signatures">
    <div class="sig">
      <div class="sig-line">
        <div class="sig-name">Tes.·. ${data.tesoreroName || ''}</div>
        <div class="sig-role">Tesorero</div>
      </div>
    </div>
    <div class="sig">
      <div class="sig-line">
        <div class="sig-name">V.·.M.·. ${data.vmName || ''}</div>
        <div class="sig-role">Venerable Maestro</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>R.·.L.·. Simón Bolívar N° 646 · Tesorería · ${data.monthName} ${data.year}${isLite ? ' (Resumen)' : ''}</p>
  </div>
</body>
</html>`;
}