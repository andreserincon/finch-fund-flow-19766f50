import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Service client for data operations - no auth required for scheduled job
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current date in Argentina timezone (UTC-3)
    // When cron runs at 02:59 UTC on the 1st, it's 23:59 ART on the last day of previous month
    const now = new Date();
    
    // Determine the month to generate report for
    // If running on the 1st at ~03:00 UTC (00:00 ART), generate for previous month
    let year: number;
    let month: number;
    
    // Check if we're in the first few hours of the month (cron running for previous month)
    if (now.getUTCDate() === 1 && now.getUTCHours() < 6) {
      // Generate report for previous month
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      year = prevMonth.getFullYear();
      month = prevMonth.getMonth() + 1;
    } else {
      // Generate report for current month
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    console.log(`Scheduled report generation triggered for ${year}-${month.toString().padStart(2, '0')}`);

    // Calculate month end date
    const monthEndDate = new Date(year, month, 0);
    const monthStartDate = new Date(year, month - 1, 1);
    const monthEndStr = monthEndDate.toISOString().split('T')[0];
    const monthStartStr = monthStartDate.toISOString().split('T')[0];

    // Check if report already exists
    const { data: existingReport } = await supabase
      .from('monthly_reports')
      .select('id, status')
      .eq('report_year', year)
      .eq('report_month', month)
      .maybeSingle();

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
    let exchangeRate = 1200;
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

    // Calculate monthly flows
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

    if (existingReport) {
      // Force regenerate - delete old snapshots
      console.log(`Overriding existing report ${existingReport.id}`);
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
          generated_by: null, // Scheduled job has no user
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
          generated_by: null, // Scheduled job has no user
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

    console.log(`Report successfully generated for ${monthName} ${year}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reportId,
        pdfPath,
        message: `Reporte generado automáticamente para ${monthName} ${year}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating scheduled report:', error);
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
    bank: 'Banco',
    great_lodge: 'Gran Logia',
    savings: 'Ahorros (USD)',
  };

  const paymentStatusLabels: Record<string, string> = {
    fully_paid: 'Pagado',
    partial: 'Pago Parcial',
    pending: 'Pendiente',
  };

  // Sort members by status for display
  const sortedMembers = [...data.memberSnapshots].sort((a: any, b: any) => {
    const statusOrder = { overdue: 0, unpaid: 1, up_to_date: 2, ahead: 3 };
    return (statusOrder[a.status as keyof typeof statusOrder] || 2) - (statusOrder[b.status as keyof typeof statusOrder] || 2);
  });

  const overdueMembers = sortedMembers.filter((m: any) => m.status === 'overdue' || m.status === 'unpaid');
  const upToDateMembers = sortedMembers.filter((m: any) => m.status === 'up_to_date');
  const aheadMembers = sortedMembers.filter((m: any) => m.status === 'ahead');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Financiero - ${data.monthName} ${data.year}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.6; 
      color: #1a1a2e; 
      background: #f8f9fa;
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); 
      color: white; 
      padding: 30px 40px; 
      text-align: center;
    }
    .header h1 { font-size: 28px; margin-bottom: 5px; }
    .header .subtitle { font-size: 16px; opacity: 0.9; }
    .header .period { font-size: 22px; margin-top: 10px; font-weight: 600; }
    .content { padding: 30px 40px; }
    .section { margin-bottom: 30px; }
    .section-title { 
      font-size: 18px; 
      font-weight: 600; 
      color: #1a1a2e; 
      border-bottom: 2px solid #e0e0e0; 
      padding-bottom: 10px; 
      margin-bottom: 20px;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .stat-card { 
      background: #f8f9fa; 
      padding: 15px 20px; 
      border-radius: 8px; 
      border-left: 4px solid #1a1a2e;
    }
    .stat-card.positive { border-left-color: #10b981; }
    .stat-card.negative { border-left-color: #ef4444; }
    .stat-card.warning { border-left-color: #f59e0b; }
    .stat-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 20px; font-weight: 700; color: #1a1a2e; margin-top: 5px; }
    .stat-card .value.positive { color: #10b981; }
    .stat-card .value.negative { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1a1a2e; color: white; padding: 12px 10px; text-align: left; font-weight: 600; }
    td { padding: 10px; border-bottom: 1px solid #e0e0e0; }
    tr:nth-child(even) { background: #f8f9fa; }
    .status-badge { 
      display: inline-block; 
      padding: 3px 10px; 
      border-radius: 12px; 
      font-size: 11px; 
      font-weight: 600; 
    }
    .status-overdue { background: #fecaca; color: #991b1b; }
    .status-unpaid { background: #fed7aa; color: #9a3412; }
    .status-up_to_date { background: #bbf7d0; color: #166534; }
    .status-ahead { background: #ddd6fe; color: #5b21b6; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .footer { 
      background: #f8f9fa; 
      padding: 20px 40px; 
      text-align: center; 
      font-size: 12px; 
      color: #666;
      border-top: 1px solid #e0e0e0;
    }
    .summary-box {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .summary-box .title { font-size: 14px; opacity: 0.9; }
    .summary-box .amount { font-size: 28px; font-weight: 700; }
    @media print {
      body { padding: 0; background: white; }
      .container { box-shadow: none; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reporte Financiero Mensual</h1>
      <div class="subtitle">Generado automáticamente</div>
      <div class="period">${data.monthName} ${data.year}</div>
    </div>
    
    <div class="content">
      <!-- Global Overview -->
      <div class="section">
        <h2 class="section-title">📊 Resumen Global</h2>
        <div class="summary-box">
          <div class="title">Balance Total (incluyendo USD convertido)</div>
          <div class="amount">${formatCurrency(data.totalARSBalance)}</div>
          <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">Tipo de cambio oficial: ${formatCurrency(data.exchangeRate)}/USD</div>
        </div>
        <div class="grid">
          <div class="stat-card">
            <div class="label">Cuenta Banco (ARS)</div>
            <div class="value">${formatCurrency(data.bankBalance)}</div>
          </div>
          <div class="stat-card">
            <div class="label">Gran Logia (ARS)</div>
            <div class="value">${formatCurrency(data.greatLodgeBalance)}</div>
          </div>
          <div class="stat-card">
            <div class="label">Ahorros (USD)</div>
            <div class="value">${formatCurrency(data.savingsBalance, 'USD')}</div>
          </div>
        </div>
      </div>

      <!-- Monthly Flow -->
      <div class="section">
        <h2 class="section-title">💰 Flujo del Mes</h2>
        <div class="grid">
          <div class="stat-card positive">
            <div class="label">Ingresos Totales</div>
            <div class="value positive">${formatCurrency(data.totalInflows)}</div>
          </div>
          <div class="stat-card negative">
            <div class="label">Egresos Totales</div>
            <div class="value negative">${formatCurrency(data.totalOutflows)}</div>
          </div>
          <div class="stat-card ${data.netResult >= 0 ? 'positive' : 'negative'}">
            <div class="label">Resultado Neto</div>
            <div class="value ${data.netResult >= 0 ? 'positive' : 'negative'}">${formatCurrency(data.netResult)}</div>
          </div>
        </div>
      </div>

      <!-- Treasury Position -->
      <div class="section">
        <h2 class="section-title">🏦 Posición de Tesorería</h2>
        <div class="grid">
          <div class="stat-card negative">
            <div class="label">Deuda de Miembros</div>
            <div class="value negative">${formatCurrency(data.outstandingMemberDebt)}</div>
          </div>
          <div class="stat-card positive">
            <div class="label">Crédito Prepago</div>
            <div class="value positive">${formatCurrency(data.prepaidMemberCredit)}</div>
          </div>
        </div>
      </div>

      <!-- Fee Collection -->
      <div class="section">
        <h2 class="section-title">📋 Cobranza de Cuotas</h2>
        <div class="grid">
          <div class="stat-card">
            <div class="label">Cuotas Esperadas</div>
            <div class="value">${formatCurrency(data.expectedMonthlyFees)}</div>
          </div>
          <div class="stat-card ${data.collectionPercentage >= 80 ? 'positive' : data.collectionPercentage >= 50 ? 'warning' : 'negative'}">
            <div class="label">Cuotas Cobradas</div>
            <div class="value">${formatCurrency(data.collectedMonthlyFees)} (${data.collectionPercentage}%)</div>
          </div>
          <div class="stat-card ${data.membersMissingPayment === 0 ? 'positive' : 'warning'}">
            <div class="label">Miembros Sin Pago</div>
            <div class="value">${data.membersMissingPayment}</div>
          </div>
        </div>
      </div>

      <!-- Member Details -->
      <div class="section">
        <h2 class="section-title">👥 Detalle de Miembros (${data.memberSnapshots.length})</h2>
        
        ${overdueMembers.length > 0 ? `
        <h3 style="color: #ef4444; margin: 15px 0 10px;">⚠️ Miembros con Deuda (${overdueMembers.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo Cuota</th>
              <th class="text-right">Monto Cuota</th>
              <th class="text-right">Balance</th>
              <th class="text-center">Meses Mora</th>
              <th>Último Pago</th>
            </tr>
          </thead>
          <tbody>
            ${overdueMembers.map((m: any) => `
              <tr>
                <td>${m.full_name}</td>
                <td>${feeTypeLabels[m.fee_type] || m.fee_type}</td>
                <td class="text-right">${formatCurrency(m.monthly_fee_amount)}</td>
                <td class="text-right" style="color: #ef4444; font-weight: 600;">${formatCurrency(m.balance_at_month_end)}</td>
                <td class="text-center">${m.months_overdue || '-'}</td>
                <td>${m.last_payment_date ? new Date(m.last_payment_date).toLocaleDateString('es-AR') : 'Sin pagos'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}

        ${upToDateMembers.length > 0 ? `
        <h3 style="color: #10b981; margin: 20px 0 10px;">✅ Miembros Al Día (${upToDateMembers.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo Cuota</th>
              <th class="text-right">Monto Cuota</th>
              <th class="text-right">Balance</th>
              <th>Último Pago</th>
            </tr>
          </thead>
          <tbody>
            ${upToDateMembers.map((m: any) => `
              <tr>
                <td>${m.full_name}</td>
                <td>${feeTypeLabels[m.fee_type] || m.fee_type}</td>
                <td class="text-right">${formatCurrency(m.monthly_fee_amount)}</td>
                <td class="text-right">${formatCurrency(m.balance_at_month_end)}</td>
                <td>${m.last_payment_date ? new Date(m.last_payment_date).toLocaleDateString('es-AR') : 'Sin pagos'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}

        ${aheadMembers.length > 0 ? `
        <h3 style="color: #5b21b6; margin: 20px 0 10px;">🌟 Miembros Adelantados (${aheadMembers.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo Cuota</th>
              <th class="text-right">Monto Cuota</th>
              <th class="text-right">Crédito</th>
              <th class="text-center">Meses Adelanto</th>
            </tr>
          </thead>
          <tbody>
            ${aheadMembers.map((m: any) => `
              <tr>
                <td>${m.full_name}</td>
                <td>${feeTypeLabels[m.fee_type] || m.fee_type}</td>
                <td class="text-right">${formatCurrency(m.monthly_fee_amount)}</td>
                <td class="text-right" style="color: #10b981; font-weight: 600;">${formatCurrency(m.balance_at_month_end)}</td>
                <td class="text-center">${m.months_ahead || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}
      </div>

      ${data.loanSnapshots.length > 0 ? `
      <!-- Loans -->
      <div class="section">
        <h2 class="section-title">💳 Préstamos Activos (${data.loanSnapshots.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Prestatario</th>
              <th>Cuenta</th>
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
                <td>${accountLabels[l.account] || l.account}</td>
                <td class="text-right">${formatCurrency(l.original_amount)}</td>
                <td class="text-right">${formatCurrency(l.amount_paid)}</td>
                <td class="text-right" style="color: ${l.outstanding_balance > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">
                  ${formatCurrency(l.outstanding_balance)}
                </td>
                <td class="text-center">
                  <span class="status-badge ${l.payment_status === 'fully_paid' ? 'status-up_to_date' : l.payment_status === 'partial' ? 'status-unpaid' : 'status-overdue'}">
                    ${paymentStatusLabels[l.payment_status] || l.payment_status}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      ${data.eventSnapshots.length > 0 ? `
      <!-- Events -->
      <div class="section">
        <h2 class="section-title">📅 Eventos Activos (${data.eventSnapshots.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th class="text-center">Miembros</th>
              <th class="text-right">Total</th>
              <th class="text-right">Cobrado</th>
              <th class="text-right">Pendiente</th>
              <th class="text-center">Sin Pagar</th>
            </tr>
          </thead>
          <tbody>
            ${data.eventSnapshots.map((e: any) => `
              <tr>
                <td>${e.event_name}</td>
                <td class="text-center">${e.members_included}</td>
                <td class="text-right">${formatCurrency(e.total_amount)}</td>
                <td class="text-right">${formatCurrency(e.amount_collected)}</td>
                <td class="text-right" style="color: ${e.outstanding_amount > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">
                  ${formatCurrency(e.outstanding_amount)}
                </td>
                <td class="text-center">${e.members_unpaid}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>Reporte generado automáticamente el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
      <p>Este documento es un reporte oficial de tesorería.</p>
    </div>
  </div>
</body>
</html>
  `;
}
