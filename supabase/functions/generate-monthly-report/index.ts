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

    // Calculate monthly flows
    const totalInflows = transactions
      .filter((t: any) => t.transaction_type === 'income')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalOutflows = transactions
      .filter((t: any) => t.transaction_type === 'expense')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

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

    const pdfContent = generatePDFHTML({
      year,
      month,
      monthName,
      bankBalance,
      greatLodgeBalance,
      savingsBalance,
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
    });

    // Upload PDF to storage
    const pdfPath = `${year}/${month.toString().padStart(2, '0')}/Reporte_Financiero_${year}_${month.toString().padStart(2, '0')}.html`;

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(pdfPath, new Blob([pdfContent], { type: 'text/html' }), {
        contentType: 'text/html',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Update report with PDF path and mark as generated
    await supabase
      .from('monthly_reports')
      .update({
        status: 'generated',
        generated_at: new Date().toISOString(),
        pdf_path: pdfPath,
      })
      .eq('id', reportId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reportId,
        pdfPath,
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

function generatePDFHTML(data: any): string {
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

  // Sort members by status priority: overdue first, then unpaid, then by balance
  const sortedMembers = [...data.memberSnapshots].sort((a: any, b: any) => {
    const statusPriority: Record<string, number> = { overdue: 0, unpaid: 1, up_to_date: 2, ahead: 3 };
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
    if (priorityDiff !== 0) return priorityDiff;
    return a.balance_at_month_end - b.balance_at_month_end;
  });

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
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
      background: #fff;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #4a69bd;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header h1 {
      color: #4a69bd;
      margin: 0;
      font-size: 28px;
    }
    
    .header p {
      color: #666;
      margin: 5px 0;
    }
    
    .section {
      margin-bottom: 30px;
    }
    
    .section-title {
      background: #4a69bd;
      color: white;
      padding: 10px 15px;
      margin: 0 0 15px 0;
      border-radius: 5px;
      font-size: 16px;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    
    .stat-card {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 15px;
      border-left: 4px solid #4a69bd;
    }
    
    .stat-card.success { border-left-color: #27ae60; }
    .stat-card.warning { border-left-color: #f39c12; }
    .stat-card.danger { border-left-color: #e74c3c; }
    
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    
    .stat-value {
      font-size: 20px;
      font-weight: bold;
      color: #1a1a2e;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    
    th {
      background: #4a69bd;
      color: white;
    }
    
    tr:nth-child(even) { background: #f8f9fa; }
    
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
    }
    
    .status-up_to_date { background: #d4edda; color: #155724; }
    .status-ahead { background: #cce5ff; color: #004085; }
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
      border-top: 1px solid #ddd;
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
      background: #4a69bd;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }
    
    .print-button:hover { background: #3a5aa8; }
    
    .summary-row {
      background: #e8f4fd !important;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">📄 Imprimir / Guardar PDF</button>

  <div class="header">
    <h1>Reporte Financiero Mensual</h1>
    <p><strong>${data.monthName} ${data.year}</strong></p>
    <p>Generado: ${new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
  </div>

  <!-- Section 1: Global Financial Overview -->
  <div class="section">
    <h2 class="section-title">1. Resumen Financiero Global</h2>
    
    <h3 style="margin: 15px 0 10px; color: #4a69bd;">Saldos de Cuentas</h3>
    <div class="grid">
      <div class="stat-card ${data.bankBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta Bancaria Principal (ARS)</div>
        <div class="stat-value">${formatCurrency(data.bankBalance)}</div>
      </div>
      <div class="stat-card ${data.greatLodgeBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta GL (ARS)</div>
        <div class="stat-value">${formatCurrency(data.greatLodgeBalance)}</div>
      </div>
      <div class="stat-card ${data.savingsBalance >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Cuenta de Ahorros (USD)</div>
        <div class="stat-value">${formatCurrency(data.savingsBalance, 'USD')}</div>
      </div>
    </div>

    <h3 style="margin: 25px 0 10px; color: #4a69bd;">Flujo del Mes</h3>
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

    <h3 style="margin: 25px 0 10px; color: #4a69bd;">Posición de Tesorería</h3>
    <div class="grid">
      <div class="stat-card danger">
        <div class="stat-label">Deuda Pendiente de Miembros</div>
        <div class="stat-value negative">${formatCurrency(data.outstandingMemberDebt)}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Crédito Prepagado</div>
        <div class="stat-value positive">${formatCurrency(data.prepaidMemberCredit)}</div>
      </div>
      <div class="stat-card ${(data.prepaidMemberCredit - data.outstandingMemberDebt) >= 0 ? 'success' : 'danger'}">
        <div class="stat-label">Posición Neta de Tesorería</div>
        <div class="stat-value">${formatCurrency(data.prepaidMemberCredit - data.outstandingMemberDebt)}</div>
      </div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- Section 2: Member Financial Detail -->
  <div class="section">
    <h2 class="section-title">2. Detalle Financiero de Miembros</h2>
    <table>
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
      <tbody>
        ${sortedMembers.map((m: any) => `
          <tr>
            <td>${m.full_name}</td>
            <td class="text-center">${feeTypeLabels[m.fee_type] || m.fee_type}</td>
            <td class="text-right">${formatCurrency(m.monthly_fee_amount)}</td>
            <td class="text-right ${m.balance_at_month_end >= 0 ? 'positive' : 'negative'}">${formatCurrency(m.balance_at_month_end)}</td>
            <td class="text-center"><span class="status-badge status-${m.status}">${statusLabels[m.status] || m.status}</span></td>
            <td class="text-center">${m.months_ahead > 0 ? `+${m.months_ahead}` : m.months_overdue > 0 ? `-${m.months_overdue}` : '0'}</td>
            <td class="text-center">${m.last_payment_date ? new Date(m.last_payment_date).toLocaleDateString('es-AR') : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <!-- Section 3: Monthly Fee Coverage -->
  <div class="section">
    <h2 class="section-title">3. Cobertura de Cuotas Mensuales</h2>
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
    <p style="margin-top: 15px; color: #666;">
      <strong>${data.membersMissingPayment}</strong> miembro(s) sin pago registrado este mes.
    </p>
  </div>

  ${data.loanSnapshots.length > 0 ? `
  <div class="page-break"></div>

  <!-- Section 4: Open Loans -->
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
        ${data.loanSnapshots.map((l: any) => `
          <tr>
            <td>${l.borrower_name}</td>
            <td class="text-center">${accountLabels[l.account] || l.account}</td>
            <td class="text-right">${formatCurrency(l.original_amount, l.account === 'savings' ? 'USD' : 'ARS')}</td>
            <td class="text-right positive">${formatCurrency(l.amount_paid, l.account === 'savings' ? 'USD' : 'ARS')}</td>
            <td class="text-right negative">${formatCurrency(l.outstanding_balance, l.account === 'savings' ? 'USD' : 'ARS')}</td>
            <td class="text-center">${l.payment_status === 'partial' ? 'Parcial' : l.payment_status === 'pending' ? 'Pendiente' : 'Pagado'}</td>
          </tr>
        `).join('')}
        <tr class="summary-row">
          <td colspan="4" class="text-right">Total Pendiente (ARS)</td>
          <td class="text-right negative">${formatCurrency(data.loanSnapshots.filter((l: any) => l.account !== 'savings').reduce((s: number, l: any) => s + l.outstanding_balance, 0))}</td>
          <td></td>
        </tr>
        <tr class="summary-row">
          <td colspan="4" class="text-right">Total Pendiente (USD)</td>
          <td class="text-right negative">${formatCurrency(data.loanSnapshots.filter((l: any) => l.account === 'savings').reduce((s: number, l: any) => s + l.outstanding_balance, 0), 'USD')}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  ${data.eventSnapshots.length > 0 ? `
  <!-- Section 5: Open Events -->
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
        ${data.eventSnapshots.map((e: any) => `
          <tr>
            <td>${e.event_name}</td>
            <td class="text-right">${formatCurrency(e.total_amount)}</td>
            <td class="text-right positive">${formatCurrency(e.amount_collected)}</td>
            <td class="text-right negative">${formatCurrency(e.outstanding_amount)}</td>
            <td class="text-center">${e.members_included}</td>
            <td class="text-center">${e.members_unpaid}</td>
            <td class="text-center">${e.event_status === 'settled' ? '✅ Saldado' : '⏳ Pendiente'}</td>
          </tr>
        `).join('')}
        <tr class="summary-row">
          <td class="text-right">Totales</td>
          <td class="text-right">${formatCurrency(data.eventSnapshots.reduce((s: number, e: any) => s + e.total_amount, 0))}</td>
          <td class="text-right positive">${formatCurrency(data.eventSnapshots.reduce((s: number, e: any) => s + e.amount_collected, 0))}</td>
          <td class="text-right negative">${formatCurrency(data.eventSnapshots.reduce((s: number, e: any) => s + e.outstanding_amount, 0))}</td>
          <td colspan="3"></td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>Tesorería · Reporte de ${data.monthName} ${data.year}</p>
  </div>
</body>
</html>`;
}