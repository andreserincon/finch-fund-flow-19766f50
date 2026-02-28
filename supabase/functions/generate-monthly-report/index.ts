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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;

    // Check if user is treasurer
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'treasurer')
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
      supabase.from('loans').select('*, member:members(full_name)').eq('status', 'active'),
      supabase.from('extraordinary_expenses').select('*').eq('is_active', true),
      supabase.from('event_member_payments').select('*'),
      supabase.from('monthly_fees').select('*').eq('year_month', `${year}-${month.toString().padStart(2, '0')}-01`),
      supabase.from('member_fee_type_history').select('*'),
    ]);

    const transactions = transactionsResult.data || [];
    const members = membersResult.data || [];
    const allMonthlyFees = allMonthlyFeesResult.data || [];
    const loans = loansResult.data || [];
    const events = eventsResult.data || [];
    const eventPayments = eventPaymentsResult.data || [];
    const monthlyFees = monthlyFeesResult.data || [];
    const feeTypeHistory = feeTypeHistoryResult.data || [];

    // Fetch all transactions and transfers up to month end first (needed for balance calculations)
    const [allTransactionsResult, allTransfersResult] = await Promise.all([
      supabase.from('transactions').select('*').lte('transaction_date', monthEndStr),
      supabase.from('account_transfers').select('*').lte('transfer_date', monthEndStr),
    ]);

    const allTransactions = allTransactionsResult.data || [];
    const allTransfers = allTransfersResult.data || [];

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

    // Calculate member balances as of month end (point-in-time snapshot)
    const calculateMemberBalanceAsOfDate = (memberId: string, asOfDate: string, memberJoinDate: string) => {
      const member = members.find((m: any) => m.id === memberId);
      if (!member) return 0;

      // Calculate total fees owed up to asOfDate
      let totalFeesOwed = 0;
      allMonthlyFees.forEach((fee: any) => {
        const feeMonth = fee.year_month;
        // Only count fees from join date to asOfDate
        if (feeMonth >= memberJoinDate.substring(0, 7) + '-01' && feeMonth <= asOfDate) {
          const memberFeeType = getMemberFeeTypeForMonth(memberId, feeMonth);
          if (fee.fee_type === memberFeeType) {
            totalFeesOwed += Number(fee.amount);
          }
        }
      });

      // Add event fees owed
      const memberEventPayments = eventPayments.filter((ep: any) => ep.member_id === memberId);
      const eventFeesOwed = memberEventPayments.reduce((sum: number, ep: any) => sum + Number(ep.amount_owed), 0);
      totalFeesOwed += eventFeesOwed;

      // Calculate total payments made up to asOfDate
      const memberPayments = allTransactions
        .filter((t: any) => 
          t.member_id === memberId && 
          t.transaction_type === 'income' &&
          (t.category === 'monthly_fee' || t.category === 'event_payment') &&
          t.transaction_date <= asOfDate
        )
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      return memberPayments - totalFeesOwed;
    };

    // Build point-in-time member balances
    const memberBalances = members.map((m: any) => {
      const balance = calculateMemberBalanceAsOfDate(m.id, monthEndStr, m.join_date);
      return {
        member_id: m.id,
        full_name: m.full_name,
        phone_number: m.phone_number,
        monthly_fee_amount: m.monthly_fee_amount,
        fee_type: getMemberFeeTypeForMonth(m.id, monthEndStr),
        is_active: m.is_active,
        join_date: m.join_date,
        current_balance: balance,
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
        })
        .select()
        .single();

      if (insertError) throw insertError;
      reportId = newReport.id;
    }

    // Create member snapshots
    const memberSnapshots = memberBalances.map((mb: any) => {
      const balance = Number(mb.current_balance || 0);
      const monthlyFeeAmount = mb.fee_type === 'standard' ? standardFee : solidarityFee;
      
      let status = 'up_to_date';
      let monthsAhead = 0;
      let monthsOverdue = 0;
      let overdueAmount = 0;

      if (balance > monthlyFeeAmount) {
        status = 'ahead';
        monthsAhead = Math.floor(balance / monthlyFeeAmount);
      } else if (balance < -monthlyFeeAmount) {
        status = 'overdue';
        monthsOverdue = Math.ceil(Math.abs(balance) / monthlyFeeAmount);
        overdueAmount = Math.abs(balance);
      } else if (balance < 0) {
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
        fee_type: mb.fee_type,
        monthly_fee_amount: monthlyFeeAmount,
        balance_at_month_end: balance,
        status,
        months_ahead: monthsAhead,
        months_overdue: monthsOverdue,
        overdue_amount: overdueAmount,
        last_payment_date: lastPaymentDate,
      };
    });

    if (memberSnapshots.length > 0) {
      await supabase.from('report_member_snapshots').insert(memberSnapshots);
    }

    // Create loan snapshots
    const loanSnapshots = loans.map((loan: any) => ({
      report_id: reportId,
      loan_id: loan.id,
      borrower_name: loan.member?.full_name || 'Unknown',
      account: loan.account,
      original_amount: loan.amount,
      amount_paid: loan.amount_paid,
      outstanding_balance: loan.amount - loan.amount_paid,
      payment_status: loan.amount_paid >= loan.amount ? 'fully_paid' : 
                     loan.amount_paid > 0 ? 'partial' : 'pending',
    }));

    if (loanSnapshots.length > 0) {
      await supabase.from('report_loan_snapshots').insert(loanSnapshots);
    }

    // Calculate loan debt split by currency
    const outstandingLoansARS = loanSnapshots
      .filter((l: any) => l.account !== 'savings')
      .reduce((sum: number, l: any) => sum + Number(l.outstanding_balance), 0);
    const outstandingLoansUSD = loanSnapshots
      .filter((l: any) => l.account === 'savings')
      .reduce((sum: number, l: any) => sum + Number(l.outstanding_balance), 0);

    // Calculate member status counts
    const membersOverdue = memberSnapshots.filter((m: any) => m.status === 'overdue').length;
    const membersLatePayment = memberSnapshots.filter((m: any) => m.status === 'unpaid').length;

    // Create event snapshots
    const eventSnapshots = events.map((event: any) => {
      const eventPaymentsForEvent = eventPayments.filter((ep: any) => ep.event_id === event.id);
      const totalAmount = eventPaymentsForEvent.reduce((sum: number, ep: any) => sum + Number(ep.amount_owed), 0);
      const amountCollected = eventPaymentsForEvent.reduce((sum: number, ep: any) => sum + Number(ep.amount_paid), 0);
      const membersIncluded = eventPaymentsForEvent.length;
      const membersUnpaid = eventPaymentsForEvent.filter((ep: any) => ep.amount_paid < ep.amount_owed).length;

      return {
        report_id: reportId,
        event_id: event.id,
        event_name: event.name,
        total_amount: totalAmount,
        amount_collected: amountCollected,
        outstanding_amount: totalAmount - amountCollected,
        members_included: membersIncluded,
        members_unpaid: membersUnpaid,
        event_status: amountCollected >= totalAmount ? 'settled' : 'pending',
      };
    });

    if (eventSnapshots.length > 0) {
      await supabase.from('report_event_snapshots').insert(eventSnapshots);
    }

    // Generate PDF content
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = monthNames[month - 1];

    // Calculate loan KPIs for lite report
    const totalActiveLoans = loans.length;
    const totalLoanAmount = loans.reduce((sum: number, l: any) => sum + Number(l.amount), 0);
    const totalLoanDue = loans.reduce((sum: number, l: any) => sum + (Number(l.amount) - Number(l.amount_paid)), 0);

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

    // Upload comprehensive report to storage
    const pdfPath = `${year}/${month.toString().padStart(2, '0')}/Reporte_Financiero_${year}_${month.toString().padStart(2, '0')}.html`;
    const litePdfPath = `${year}/${month.toString().padStart(2, '0')}/Reporte_Financiero_Lite_${year}_${month.toString().padStart(2, '0')}.html`;

    const [uploadResult, liteUploadResult] = await Promise.all([
      supabase.storage
        .from('reports')
        .upload(pdfPath, new Blob([pdfContent], { type: 'text/html' }), {
          contentType: 'text/html',
          upsert: true,
        }),
      supabase.storage
        .from('reports')
        .upload(litePdfPath, new Blob([liteContent], { type: 'text/html' }), {
          contentType: 'text/html',
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

    // Update report with both PDF paths, new KPIs, and mark as generated
    await supabase
      .from('monthly_reports')
      .update({
        status: 'generated',
        generated_at: new Date().toISOString(),
        pdf_path: pdfPath,
        lite_pdf_path: litePdfPath,
        outstanding_loans_ars: outstandingLoansARS,
        outstanding_loans_usd: outstandingLoansUSD,
        members_overdue: membersOverdue,
        members_late_payment: membersLatePayment,
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
    overdue: 'Moroso',
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
  
  const memberSectionTitle = '2. Detalle Financiero de Miembros';
  // For lite: section 2 is fee coverage (since member detail is skipped)
  const feeSectionTitle = isLite ? '2. Cobranza de Capita' : '3. Cobertura de Cuotas Mensuales';
  // For lite: loans section is 3, events is 4
  const loansSectionNum = isLite ? '3' : '4';
  const eventsSectionNum = isLite ? '4' : '5';

  // Build member rows
  const memberRows = membersToShow.map((m: any) => `
    <tr>
      <td>${m.full_name}</td>
      <td class="text-center">${feeTypeLabels[m.fee_type] || m.fee_type}</td>
      <td class="text-right">${formatCurrency(m.monthly_fee_amount)}</td>
      <td class="text-right ${m.balance_at_month_end >= 0 ? 'positive' : 'negative'}">${formatCurrency(m.balance_at_month_end)}</td>
      <td class="text-center"><span class="status-badge status-${m.status}">${statusLabels[m.status] || m.status}</span></td>
      <td class="text-center">${m.months_ahead > 0 ? `+${m.months_ahead}` : m.months_overdue > 0 ? `-${m.months_overdue}` : '0'}</td>
      <td class="text-center">${m.last_payment_date ? new Date(m.last_payment_date).toLocaleDateString('es-AR') : '-'}</td>
    </tr>
  `).join('');

  // Build member section
  const memberSection = membersToShow.length > 0 
    ? `<table>
        <thead>
          <tr>
            <th>Miembro</th>
            <th class="text-center">Tipo Cuota</th>
            <th class="text-right">Cuota Mensual</th>
            <th class="text-right">Saldo</th>
            <th class="text-center">Estado</th>
            <th class="text-center">Meses</th>
            <th class="text-center">Último Pago</th>
          </tr>
        </thead>
        <tbody>${memberRows}</tbody>
      </table>`
    : `<p style="color: #666; text-align: center;">No hay miembros con más de un mes de capita pendiente.</p>`;

  // Build loans section
  let loansSection = '';
  if (isLite) {
    if (data.totalActiveLoans > 0) {
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
            </div>
            <div class="stat-card danger">
              <div class="stat-label">Monto Pendiente de Cobro</div>
              <div class="stat-value negative">${formatCurrency(data.totalLoanDue)}</div>
            </div>
          </div>
        </div>
      `;
    }
  } else if (data.loanSnapshots.length > 0) {
    const loanRows = data.loanSnapshots.map((l: any) => `
      <tr>
        <td>${l.borrower_name}</td>
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
      <div class="page-break"></div>
      <div class="section">
        <h2 class="section-title">${loansSectionNum}. Préstamos Activos</h2>
        <table>
          <thead>
            <tr>
              <th>Prestatario</th>
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
    const eventRows = data.eventSnapshots.map((e: any) => `
      <tr>
        <td>${e.event_name}</td>
        <td class="text-right">${formatCurrency(e.total_amount)}</td>
        <td class="text-right positive">${formatCurrency(e.amount_collected)}</td>
        <td class="text-right negative">${formatCurrency(e.outstanding_amount)}</td>
        <td class="text-center">${e.members_included}</td>
        <td class="text-center">${e.members_unpaid}</td>
        <td class="text-center">${e.event_status === 'settled' ? '✅ Saldado' : '⏳ Pendiente'}</td>
      </tr>
    `).join('');

    const totalEventAmount = data.eventSnapshots.reduce((s: number, e: any) => s + e.total_amount, 0);
    const totalEventCollected = data.eventSnapshots.reduce((s: number, e: any) => s + e.amount_collected, 0);
    const totalEventOutstanding = data.eventSnapshots.reduce((s: number, e: any) => s + e.outstanding_amount, 0);

    eventsSection = `
      <div class="section">
        <h2 class="section-title">${eventsSectionNum}. Eventos / Gastos Extraordinarios</h2>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th class="text-right">Total</th>
              <th class="text-right">Recaudado</th>
              <th class="text-right">Pendiente</th>
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
              <td colspan="3"></td>
            </tr>
          </tbody>
        </table>
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
      body { margin: 0; padding: 8px; }
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
      color: #555;
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
      color: #666;
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
  ` : `
    /* Comprehensive report - full styling */
    @media print {
      body { margin: 0; padding: 20px; }
      .page-break { page-break-before: always; }
      .no-print { display: none; }
      @page { margin: 20mm 15mm; }
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
      background: #fff;
    }
    
    .header {
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
      margin-bottom: 30px;
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
    
    .header-title { text-align: center; margin-top: 15px; }
    
    .header-title h1 {
      color: #000;
      margin: 0;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    
    .page-header { display: none; }
    
    @media print {
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 10px;
        border-bottom: 1px solid #999;
        margin-bottom: 15px;
        font-size: 10px;
        color: #666;
      }
      .page-header .logo-small { width: 30px; height: auto; }
    }
    
    .section { margin-bottom: 30px; }
    
    .section-title {
      background: #000;
      color: white;
      padding: 10px 15px;
      margin: 0 0 15px 0;
      border-radius: 3px;
      font-size: 16px;
      font-weight: bold;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    
    .stat-card {
      background: #f9f9f9;
      border-radius: 5px;
      padding: 15px;
      border-left: 4px solid #333;
      border: 1px solid #ddd;
    }
    
    .stat-card.success { border-left: 4px solid #27ae60; }
    .stat-card.warning { border-left: 4px solid #f39c12; }
    .stat-card.danger { border-left: 4px solid #e74c3c; }
    
    .stat-label {
      font-size: 12px;
      color: #555;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    
    .stat-value { font-size: 20px; font-weight: bold; color: #1a1a1a; }
    
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
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 10px;
      color: #666;
      padding: 10px;
      border-top: 1px solid #999;
      background: white;
    }
    
    @media print {
      .footer { position: fixed; bottom: 10px; }
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
      margin: 25px 0 10px;
      color: #1a1a1a;
      font-size: 14px;
      font-weight: 600;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
    }
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Financiero${isLite ? ' Resumen' : ''} - ${data.monthName} ${data.year}</title>
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
        ${isLite ? '' : `<div style="font-size: 10px; color: #666; margin-top: 4px;">Incluye USD al TC Oficial: ${formatCurrency(data.exchangeRate)}</div>`}
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
    ${isLite ? '' : `<div class="grid" style="margin-top: 15px; grid-template-columns: 1fr;">
      <div class="stat-card ${data.savingsBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta de Ahorros (USD)</div>
        <div class="stat-value">${formatCurrency(data.savingsBalance, 'USD')}</div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">Equivalente en ARS: ${formatCurrency(data.savingsBalance * data.exchangeRate)}</div>
      </div>
    </div>`}

    <h3 class="subsection-title">Flujo del Mes${isLite ? '' : ' (en ARS)'}</h3>
    <div class="grid">
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
    </div>

    <h3 class="subsection-title">Posición de Miembros</h3>
    <div class="grid" style="grid-template-columns: repeat(2, 1fr);">
      <div class="stat-card danger">
        <div class="stat-label">Deuda Pendiente</div>
        <div class="stat-value negative">${formatCurrency(data.outstandingMemberDebt)}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Crédito Prepagado</div>
        <div class="stat-value positive">${formatCurrency(data.prepaidMemberCredit)}</div>
      </div>
    </div>
  </div>

  ${isLite ? '' : `<div class="page-break"></div>
  
  <!-- Condensed header for page 2+ -->
  <div class="page-header">
    ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" class="logo-small" />` : ''}
    <span>R.·.L.·. Simón Bolívar N° 646</span>
    <span>${reportTitleFormatted}</span>
  </div>`}

  ${isLite ? '' : `<!-- Section 2: Member Financial Detail -->
  <div class="section">
    <h2 class="section-title">${memberSectionTitle}</h2>
    ${memberSection}
  </div>`}

  <!-- Section 3: Monthly Fee Coverage -->
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
    ${isLite ? '' : `<p style="margin-top: 15px; color: #555;">
      <strong>${data.membersMissingPayment}</strong> miembro(s) sin pago registrado este mes.
    </p>`}
  </div>

  ${loansSection}

  ${eventsSection}

  <div class="footer">
    <p>R.·.L.·. Simón Bolívar N° 646 · Tesorería · ${data.monthName} ${data.year}${isLite ? ' (Resumen)' : ''}</p>
  </div>
</body>
</html>`;
}