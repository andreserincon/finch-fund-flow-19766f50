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

    // Fetch all required data
    const [
      transactionsResult,
      membersResult,
      memberBalancesResult,
      loansResult,
      eventsResult,
      eventPaymentsResult,
      monthlyFeesResult,
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .gte('transaction_date', monthStartStr)
        .lte('transaction_date', monthEndStr),
      supabase.from('members').select('*').eq('is_active', true),
      supabase.from('member_balances').select('*'),
      supabase.from('loans').select('*, member:members(full_name)').eq('status', 'active'),
      supabase.from('extraordinary_expenses').select('*').eq('is_active', true),
      supabase.from('event_member_payments').select('*'),
      supabase.from('monthly_fees').select('*').eq('year_month', `${year}-${month.toString().padStart(2, '0')}-01`),
    ]);

    const transactions = transactionsResult.data || [];
    const members = membersResult.data || [];
    const memberBalances = memberBalancesResult.data || [];
    const loans = loansResult.data || [];
    const events = eventsResult.data || [];
    const eventPayments = eventPaymentsResult.data || [];
    const monthlyFees = monthlyFeesResult.data || [];

    // Calculate account balances from all transactions up to month end
    const { data: allTransactions } = await supabase
      .from('transactions')
      .select('*')
      .lte('transaction_date', monthEndStr);

    const { data: allTransfers } = await supabase
      .from('account_transfers')
      .select('*')
      .lte('transfer_date', monthEndStr);

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

  // For lite report, only include overdue members
  const membersToShow = isLite 
    ? sortedMembers.filter((m: any) => m.status === 'overdue')
    : sortedMembers;
  
  const memberSectionTitle = isLite ? '2. Miembros con más de un mes de capita pendiente' : '2. Detalle Financiero de Miembros';
  const feeSectionTitle = isLite ? '3. Cobranza de Capita' : '3. Cobertura de Cuotas Mensuales';

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
          <h2 class="section-title">4. Préstamos Activos (Resumen)</h2>
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
        <h2 class="section-title">4. Préstamos Activos</h2>
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
        <h2 class="section-title">5. Eventos / Gastos Extraordinarios</h2>
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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Financiero - ${data.monthName} ${data.year}</title>
  <style>
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
    
    /* Header styling - Black & White institutional */
    .header {
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 15px;
    }
    
    .header-logo {
      width: 70px;
      height: auto;
    }
    
    .header-center {
      flex: 1;
      text-align: center;
    }
    
    .header-invocation {
      font-size: 14px;
      font-weight: bold;
      color: #000;
      letter-spacing: 2px;
      margin-bottom: 5px;
    }
    
    .header-right {
      text-align: right;
    }
    
    .header-lodge {
      font-size: 14px;
      font-weight: bold;
      color: #000;
    }
    
    .header-date {
      font-size: 12px;
      color: #333;
      margin-top: 8px;
    }
    
    .header-title {
      text-align: center;
      margin-top: 15px;
    }
    
    .header-title h1 {
      color: #000;
      margin: 0;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    
    /* Condensed header for subsequent pages */
    .page-header {
      display: none;
    }
    
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
      .page-header .logo-small {
        width: 30px;
        height: auto;
      }
    }
    
    .section {
      margin-bottom: 30px;
    }
    
    /* Section titles - Black background */
    .section-title {
      background: #1a1a1a;
      color: white;
      padding: 10px 15px;
      margin: 0 0 15px 0;
      border-radius: 3px;
      font-size: 16px;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    
    /* Stat cards - Gray borders with status colors preserved */
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
    
    .stat-value {
      font-size: 20px;
      font-weight: bold;
      color: #1a1a1a;
    }
    
    /* Tables - Black/gray borders */
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
    
    th {
      background: #1a1a1a;
      color: white;
    }
    
    tr:nth-child(even) { background: #f5f5f5; }
    
    /* Status badges - preserve KPI colors */
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
    
    /* KPI colors preserved */
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
      .footer {
        position: fixed;
        bottom: 10px;
      }
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
    
    /* Subsection headers - Gray */
    .subsection-title {
      margin: 25px 0 10px;
      color: #1a1a1a;
      font-size: 14px;
      font-weight: 600;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">📄 Imprimir / Guardar PDF</button>

  <!-- Main Header - Full version on first page -->
  <div class="header">
    <div class="header-top">
      ${logoHtml ? `<div class="header-left">${logoHtml}</div>` : '<div class="header-left"></div>'}
      <div class="header-center">
        <div class="header-invocation">A.·.L.·.G.·.D.·.G.·.A.·.D.·.U.·.</div>
      </div>
      <div class="header-right">
        <div class="header-lodge">R.·.L.·. Simón Bolívar N° 646</div>
        <div class="header-date">${formattedDate}</div>
      </div>
    </div>
    <div class="header-title">
      <h1>${reportTitleFormatted}</h1>
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
        <div style="font-size: 10px; color: #666; margin-top: 4px;">Incluye USD al TC Oficial: ${formatCurrency(data.exchangeRate)}</div>
      </div>
      <div class="stat-card ${data.bankBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta Bancaria Principal (ARS)</div>
        <div class="stat-value">${formatCurrency(data.bankBalance)}</div>
      </div>
      <div class="stat-card ${data.greatLodgeBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta GL (ARS)</div>
        <div class="stat-value">${formatCurrency(data.greatLodgeBalance)}</div>
      </div>
    </div>
    <div class="grid" style="margin-top: 15px; grid-template-columns: 1fr;">
      <div class="stat-card ${data.savingsBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta de Ahorros (USD)</div>
        <div class="stat-value">${formatCurrency(data.savingsBalance, 'USD')}</div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">Equivalente en ARS: ${formatCurrency(data.savingsBalance * data.exchangeRate)}</div>
      </div>
    </div>

    <h3 class="subsection-title">Flujo del Mes (en ARS)</h3>
    <div class="grid">
      <div class="stat-card success">
        <div class="stat-label">Ingresos Totales</div>
        <div class="stat-value positive">${formatCurrency(data.totalInflows)}</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-label">Egresos Totales</div>
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
        <div class="stat-label">Deuda Pendiente de Miembros</div>
        <div class="stat-value negative">${formatCurrency(data.outstandingMemberDebt)}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Crédito Prepagado</div>
        <div class="stat-value positive">${formatCurrency(data.prepaidMemberCredit)}</div>
      </div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- Condensed header for page 2+ -->
  <div class="page-header">
    ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" class="logo-small" />` : ''}
    <span>R.·.L.·. Simón Bolívar N° 646</span>
    <span>${reportTitleFormatted}</span>
  </div>

  <!-- Section 2: Member Financial Detail -->
  <div class="section">
    <h2 class="section-title">${memberSectionTitle}</h2>
    ${memberSection}
  </div>

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
        <div class="stat-label">Porcentaje de Recaudación</div>
        <div class="stat-value">${data.collectionPercentage}%</div>
      </div>
    </div>
    <p style="margin-top: 15px; color: #555;">
      <strong>${data.membersMissingPayment}</strong> miembro(s) sin pago registrado este mes.
    </p>
  </div>

  ${loansSection}

  ${eventsSection}

  <div class="footer">
    <p>R.·.L.·. Simón Bolívar N° 646 · Tesorería · ${data.monthName} ${data.year}${isLite ? ' (Resumen)' : ''}</p>
  </div>
</body>
</html>`;
}