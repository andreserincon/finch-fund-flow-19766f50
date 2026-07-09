const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Scheduled monthly report trigger.
 *
 * This function does NOT build the report itself. It computes the target month
 * and delegates to the on-demand generator (generate-monthly-report), which is
 * the single source of truth for the report template, the financial figures,
 * and the persisted monthly_reports row. Keeping one generator guarantees the
 * automatic report and the treasurer's on-demand report are identical (before
 * this, the scheduled path was a stale copy that could compute a different net
 * result and lacked the redesign, event overall-balance and signatures).
 *
 * It runs on a cron and generates the previous month. It passes
 * forceRegenerate:true, so it always (re)generates the target month and
 * overwrites any existing report for that month with the canonical output.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Determine the month to generate report for.
    // When cron runs at ~03:00 UTC on the 1st, it's ~00:00 ART (UTC-3) on the
    // 1st, so the month that just closed is the previous one. Outside that
    // window, target the current month. (Kept verbatim from the previous
    // scheduled implementation so the trigger timing is unchanged.)
    const now = new Date();
    let year: number;
    let month: number;
    if (now.getUTCDate() === 1 && now.getUTCHours() < 6) {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      year = prevMonth.getFullYear();
      month = prevMonth.getMonth() + 1;
    } else {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    console.log(`Scheduled report generation triggered for ${year}-${month.toString().padStart(2, '0')}`);

    // Delegate to the single source of truth. The service-role bearer marks
    // this as the system/cron path inside the generator, which skips the
    // per-user treasurer gate and records generated_by as null.
    // forceRegenerate:true overwrites any existing report for the month.
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-monthly-report`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ year, month, forceRegenerate: true }),
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('Delegated report generation failed:', res.status, payload);
      return new Response(
        JSON.stringify({ error: 'Report generation failed', status: res.status, detail: payload }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scheduled report generated for ${year}-${month.toString().padStart(2, '0')}.`);
    return new Response(
      JSON.stringify({ success: true, year, month, result: payload }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Scheduled report trigger error:', error);
    const message = error instanceof Error ? error.message : 'Scheduled report trigger error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
