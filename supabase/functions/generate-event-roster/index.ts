import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Render an HTML string to a real PDF via PDFShift (same service the monthly
 * report uses). Requires the PDFSHIFT_API_KEY secret.
 */
async function convertHtmlToPdf(html: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get('PDFSHIFT_API_KEY');
  if (!apiKey) throw new Error('PDFSHIFT_API_KEY is not configured');

  const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`api:${apiKey}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: html,
      format: 'A4',
      landscape: false,
      use_print: true,
      margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PDFShift failed: ${res.status} ${errText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const GRADE_LABELS: Record<string, string> = {
  profano: 'Profano',
  aprendiz: 'Aprendiz',
  companero: 'Compañero',
  maestro: 'Maestro',
};
const gradeLabel = (g: string | null | undefined): string => (g ? (GRADE_LABELS[g] ?? g) : '-');

const LODGE_NAME = 'R.·.L.·. Simón Bolívar N° 646';

const fmtARS = (n: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Payment status, mirroring the in-app getParticipantStatus vocabulary. */
function statusFor(owed: number, paid: number, deadline: string | null): { label: string; cls: string } {
  if (owed <= 0) return { label: 'Sin cuota', cls: 's-muted' };
  if (paid >= owed) return { label: 'Pagado', cls: 's-paid' };
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = !!deadline && deadline.slice(0, 10) < todayStr;
  if (overdue) return { label: 'Demorado', cls: 's-overdue' };
  if (paid > 0) return { label: 'Pendiente', cls: 's-pending' };
  return { label: 'Impago', cls: 's-unpaid' };
}

interface RosterRow {
  name: string;
  grade: string;
  lodge: string;
  pending: number;
  status: { label: string; cls: string };
}

function buildHtml(eventName: string, dateStr: string, rows: RosterRow[], includePayments: boolean, logoBase64?: string): string {
  const logoHtml = logoBase64
    ? `<img class="header-logo" src="data:image/png;base64,${logoBase64}" />`
    : '';
  const colCount = includePayments ? 6 : 4;

  const tableRows = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.grade)}</td>
        <td>${escapeHtml(r.lodge)}</td>
        ${includePayments ? `<td style="text-align:right;font-family:monospace;">${r.pending > 0 ? fmtARS(r.pending) : '-'}</td>
        <td><span class="status-badge ${r.status.cls}">${r.status.label}</span></td>` : ''}
        <td style="text-align:center;"><span class="check-box"></span></td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Lista de asistencia - ${escapeHtml(eventName)}</title>
  <style>
    @media print { @page { margin: 8mm 8mm; size: A4; } }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.2; color: #1a1a1a; max-width: 210mm; margin: 0 auto;
      padding: 8px; background: #fff; font-size: 9px;
    }
    .header { border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .header-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 4px; }
    .header-logo { width: 40px; height: auto; }
    .header-center { flex: 1; text-align: center; }
    .header-invocation { font-size: 10px; font-weight: bold; color: #000; letter-spacing: 1px; }
    .header-right-block { text-align: right; margin-bottom: 4px; }
    .header-lodge { font-size: 9px; font-weight: bold; color: #000; margin-bottom: 1px; }
    .header-date { font-size: 8px; font-weight: bold; color: #000; }
    .header-title { text-align: center; margin-top: 6px; }
    .header-title h1 { color: #000; margin: 0; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; }
    .event-name { text-align: center; font-size: 10px; font-weight: bold; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 8px; margin-top: 10px; }
    th, td { border: 1px solid #999; padding: 4px 5px; text-align: left; }
    th { background: #000; color: white; font-size: 7px; font-weight: bold; }
    tr:nth-child(even) { background: #f5f5f5; }
    .status-badge { display: inline-block; padding: 1px 4px; border-radius: 8px; font-size: 7px; font-weight: bold; }
    .s-paid { background: #d4edda; color: #155724; }
    .s-pending { background: #e0e0e0; color: #333; }
    .s-overdue { background: #f8d7da; color: #721c24; }
    .s-unpaid { background: #fff3cd; color: #856404; }
    .s-muted { background: #eee; color: #666; }
    .check-box { display: inline-block; width: 11px; height: 11px; border: 1px solid #000; }
    .meta { font-size: 8px; color: #333; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="header-left">${logoHtml}</div>
      <div class="header-center"><div class="header-invocation">A.·.L.·.G.·.D.·.G.·.A.·.D.·.U.·.</div></div>
      <div style="width: 40px;"></div>
    </div>
    <div class="header-right-block">
      <div class="header-lodge">${LODGE_NAME}</div>
      <div class="header-date">${escapeHtml(dateStr)}</div>
    </div>
    <div class="header-title"><h1>LISTA DE ASISTENCIA</h1></div>
    <div class="event-name">${escapeHtml(eventName)}</div>
  </div>

  <div class="meta">Total de participantes: ${rows.length}</div>

  <table>
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Grado</th>
        <th>Logia</th>
        ${includePayments ? `<th style="text-align:right;">Pago pendiente</th>
        <th>Estado de pago</th>` : ''}
        <th style="text-align:center;width:60px;">Asistencia</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="${colCount}" style="text-align:center;padding:12px;">Sin participantes</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
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

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only staff (treasurer, admin, or the Venerable) may generate the roster.
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['treasurer', 'admin', 'vm'])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'No autorizado para generar el reporte.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { eventId, includePayments = true } = await req.json();
    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Falta eventId.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: event, error: eventError } = await supabase
      .from('extraordinary_expenses')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: 'Evento no encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: payments, error: payError } = await supabase
      .from('event_member_payments')
      .select('*, member:members(full_name, masonic_grade)')
      .eq('event_id', eventId);

    if (payError) throw payError;

    const deadline: string | null = (event as { payment_deadline?: string | null }).payment_deadline ?? null;

    const rows: RosterRow[] = (payments ?? []).map((p: Record<string, unknown>) => {
      const member = p.member as { full_name?: string; masonic_grade?: string } | null;
      const owed = Number(p.amount_owed) || 0;
      const paid = Number(p.amount_paid) || 0;
      const isMember = !!p.member_id;
      return {
        name: isMember ? (member?.full_name ?? 'Miembro') : String(p.guest_name ?? 'Invitado'),
        grade: isMember ? gradeLabel(member?.masonic_grade) : gradeLabel(p.guest_grade as string | null),
        lodge: isMember ? LODGE_NAME : String(p.guest_lodge ?? '-'),
        pending: Math.max(0, owed - paid),
        status: statusFor(owed, paid, deadline),
      };
    });

    rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    // Logo from the same storage location the monthly report uses.
    let logoBase64: string | undefined;
    try {
      const { data: logoData } = await supabase.storage.from('reports').download('assets/lodge-logo.png');
      if (logoData) logoBase64 = bytesToBase64(new Uint8Array(await logoData.arrayBuffer()));
    } catch (e) {
      console.warn('Failed to load logo:', e);
    }

    const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    const eventName = String((event as { name?: string }).name ?? 'Evento');
    const html = buildHtml(eventName, dateStr, rows, includePayments, logoBase64);
    const pdf = await convertHtmlToPdf(html);

    const safeName = eventName.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const filename = `RLSB646_Asistencia_${safeName}${includePayments ? '' : '_Simple'}.pdf`;

    return new Response(
      JSON.stringify({ filename, pdfBase64: bytesToBase64(pdf) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('generate-event-roster error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
