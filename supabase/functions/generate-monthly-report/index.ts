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

    // Client for auth validation
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

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
        members_included: membersIncluded,
        members_unpaid: membersUnpaid,
        event_status: amountCollected >= totalAmount ? 'settled' : 'pending',
      };
    });

    if (eventSnapshots.length > 0) {
      // expenses_ars and balance_ars are render-only; strip before
      // persisting since report_event_snapshots doesn't have those columns.
      const eventSnapshotsForDb = eventSnapshots.map(
        ({ expenses_ars, balance_ars, ...rest }: any) => rest
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
      monthly_fee: 'Cuota Mensual',
      extraordinary_income: 'Ingreso Extraordinario',
      donation: 'Donación',
      reimbursement: 'Reembolso',
      event_expense: 'Gasto de Evento',
      parent_organization_fee: 'Pago GL',
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
    await supabase
      .from('monthly_reports')
      .update({
        status: 'generated',
        generated_at: new Date().toISOString(),
        pdf_path: pdfPath,
        lite_pdf_path: litePdfPath,
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
    const summary = row.summary && row.summary.trim().length > 0
      ? row.summary
      : '(sin resumen)';
    const concepto = `Otro Gasto - ${summary}`;
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
      const summary = row.summary && String(row.summary).trim().length > 0
        ? row.summary
        : '(sin resumen)';
      concepto = `Gasto Evento - "${eventNameTrunc}" - ${summary}`;
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
    + '<tr class="summary-row">'
    + '<td><strong>Balance Final</strong></td>'
    + '<td class="text-right ' + (finalARS >= 0 ? 'positive' : 'negative') + '"><strong>' + formatCurrency(finalARS) + '</strong></td>'
    + '<td class="text-right ' + (finalUSD >= 0 ? 'positive' : 'negative') + '"><strong>' + formatCurrency(finalUSD, 'USD') + '</strong></td>'
    + '<td class="text-right">-</td>'
    + '<td class="text-right">-</td>'
    + '</tr>'
    + '</tbody></table>';
}

function generatePDFHTML(data: any, reportType: 'comprehensive' | 'lite' = 'comprehensive', logoBase64?: string): string {
  const isLite = reportType === 'lite';
  
  const formatCurrency = (amount: number, currency = 'ARS') => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'ARS',
      minimumFractionDigits: 2,
    }).format(amount);
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

  // Format generation date in Spanish ceremonial format
  const now = new Date();
  const dayNum = now.getDate();
  const monthNameGenerated = monthNames[now.getMonth()];
  const yearGenerated = now.getFullYear();
  const formattedDate = `Or.·. de Buenos Aires, ${dayNum} de ${monthNameGenerated} del ${yearGenerated} (E.·.V.·.)`;

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
  
  const memberSectionTitle = '4. Detalle Financiero de Miembros';
  const feeSectionTitle = isLite ? '2. Cobranza de Capita' : '2. Cobertura de Cuotas Mensuales';
  const loansSectionNum = '3';
  const eventsSectionNum = isLite ? '4' : '5';

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
            <th class="text-right">Capita Mensual</th>
            <th class="text-right">Saldo Capita</th>
            <th class="text-right">Saldo Eventos</th>
            <th class="text-center">Estado</th>
            <th class="text-center">Meses</th>
            <th class="text-center">Último Pago</th>
          </tr>
        </thead>
        <tbody>${memberRows}</tbody>
      </table>`
    : `<p style="color: #000; text-align: center;">No hay miembros con más de un mes de capita pendiente.</p>`;

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
      const balanceArs = Number(e.balance_ars ?? (Number(e.amount_collected) - expensesArs));
      const balanceClass = balanceArs >= 0 ? 'positive' : 'negative';
      return `
      <tr>
        <td>${e.event_name}</td>
        <td class="text-right">${formatCurrency(e.total_amount)}</td>
        <td class="text-right positive">${formatCurrency(e.amount_collected)}</td>
        <td class="text-right negative">${formatCurrency(e.outstanding_amount)}</td>
        <td class="text-right ${expensesArs > 0 ? 'negative' : ''}">${expensesArs > 0 ? formatCurrency(expensesArs) : '-'}</td>
        <td class="text-right ${balanceClass}"><strong>${formatCurrency(balanceArs)}</strong></td>
        <td class="text-center">${e.members_included}</td>
        <td class="text-center">${e.members_unpaid}</td>
        <td class="text-center">${e.event_status === 'settled' ? '✅ Saldado' : '⏳ Pendiente'}</td>
      </tr>
    `;
    }).join('');

    const totalEventAmount = data.eventSnapshots.reduce((s: number, e: any) => s + e.total_amount, 0);
    const totalEventCollected = data.eventSnapshots.reduce((s: number, e: any) => s + e.amount_collected, 0);
    const totalEventOutstanding = data.eventSnapshots.reduce((s: number, e: any) => s + e.outstanding_amount, 0);
    const totalEventExpenses = data.eventSnapshots.reduce((s: number, e: any) => s + Number(e.expenses_ars ?? 0), 0);
    const totalEventBalance = totalEventCollected - totalEventExpenses;
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
              <th class="text-right">Gastos</th>
              <th class="text-right">Balance Evento</th>
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
    const cardSubNum = isLite ? (eventsSectionNum + '.1') : (eventsSectionNum + '.1');
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
      return `
        <div class="section" style="page-break-inside: avoid; margin-top: 16px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px;">${ev.event_name}</h3>
          <div class="grid">
            <div class="stat-card">
              <div class="stat-label">Ingresos por Capita (mes)</div>
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
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">📄 Imprimir / Guardar PDF</button>

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

  <!-- Section 1: Global Financial Overview -->
  <div class="section">
    <h2 class="section-title">1. Resumen Financiero Global</h2>
    
    <h3 class="subsection-title">Saldos de Cuentas</h3>
    <div class="grid">
      <div class="stat-card ${data.totalARSBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Balance Total (ARS)</div>
        <div class="stat-value">${formatCurrency(data.totalARSBalance)}</div>
        ${isLite ? '' : `<div style="font-size: 10px; color: #000; margin-top: 4px;">Incluye USD al TC Oficial: ${formatCurrency(data.exchangeRate)}</div>`}
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

    <h3 class="subsection-title">Flujo del Mes</h3>
    ${isLite ? `<div class="grid" style="grid-template-columns: repeat(3, 1fr);">
      <div class="stat-card success">
        <div class="stat-label">Ingresos</div>
        <div class="stat-value positive">${formatCurrency(data.totalInflows)}</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-label">Egresos</div>
        <div class="stat-value negative">${formatCurrency(data.totalOutflows)}</div>
      </div>
      <div class="stat-card ${data.netResult >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Resultado Neto</div>
        <div class="stat-value ${data.netResult >= 0 ? 'positive' : 'negative'}">${formatCurrency(data.netResult)}</div>
      </div>
    </div>` : buildFlowTable(data, formatCurrency)}

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
        <div class="stat-label">Miembros Impagos</div>
        <div class="stat-value" style="color: #f39c12;">${data.memberSnapshots.filter((m: any) => m.status === 'unpaid' || m.status === 'overdue').length}</div>
        <div class="stat-subtext">Con cuotas pendientes</div>
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
        <div class="stat-label">Cuotas Esperadas</div>
        <div class="stat-value">${formatCurrency(data.expectedMonthlyFees)}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Cuotas Recaudadas</div>
        <div class="stat-value">${formatCurrency(data.collectedMonthlyFees)}</div>
      </div>
      <div class="stat-card ${data.collectionPercentage >= 80 ? 'success' : data.collectionPercentage >= 50 ? 'warning' : 'danger'}">
        <div class="stat-label">% Recaudación</div>
        <div class="stat-value">${data.collectionPercentage}%</div>
      </div>
    </div>
    ${isLite ? '' : `<p style="margin-top: 15px; color: #000;">
      <strong>${data.membersMissingPayment}</strong> miembro(s) sin pago registrado este mes.
    </p>`}
  </div>

  <!-- Section 3: Loans (on page 1) -->
  ${loansSection}

  ${eventsSection}

  ${perEventDetailsSection}

  ${isLite ? '' : `<div class="page-break"></div>

  <!-- Page 2 header (only shows when printing, before the member table) -->
  <div class="page-header">
    ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" class="logo-small" />` : ''}
    <span>R.·.L.·. Simón Bolívar N° 646</span>
    <span>${reportTitleFormatted}</span>
  </div>`}

  ${isLite ? '' : `<!-- Section 4: Member Financial Detail, marked splittable so
       a long member list flows across pages instead of leaving a
       half-empty page above it. Column headers repeat on each new
       page thanks to thead { display: table-header-group }. -->
  <div class="section section--splittable">
    <h2 class="section-title">${memberSectionTitle}</h2>
    ${memberSection}
  </div>`}

  <div class="footer">
    <p>R.·.L.·. Simón Bolívar N° 646 · Tesorería · ${data.monthName} ${data.year}${isLite ? ' (Resumen)' : ''}</p>
  </div>
</body>
</html>`;
}