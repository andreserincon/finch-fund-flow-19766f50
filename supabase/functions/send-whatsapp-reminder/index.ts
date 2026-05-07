/**
 * @file send-whatsapp-reminder/index.ts
 * @description Manually-triggered edge function. Sends one or more
 *   queued reminders via Twilio WhatsApp and updates each row's status.
 *   Requires admin auth. Body shape: `{ reminder_ids: string[] }`.
 *
 *   Twilio Content API is used so messages are sent as approved utility
 *   templates, which is required for outbound WhatsApp messages outside
 *   a 24h customer-service window. The template SID and the variable
 *   names ({{1}}/{{2}}/{{3}}) are configured by the treasurer in the
 *   Twilio Console; this function just forwards the variables.
 *
 *   Env (set in Supabase Dashboard → Edge Functions → Secrets):
 *     TWILIO_ACCOUNT_SID
 *     TWILIO_AUTH_TOKEN
 *     TWILIO_WHATSAPP_FROM      e.g. +14155238886 (sandbox) or your sender
 *     TWILIO_TEMPLATE_SID       Content SID of the approved template
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

interface SendBody {
  reminder_ids?: string[];
}

interface SendResult {
  reminder_id: string;
  status: 'sent' | 'failed';
  twilio_message_sid?: string;
  error?: string;
}

async function sendOneViaTwilio(opts: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  contentSid: string;
  variables: Record<string, string>;
}): Promise<{ sid: string; finalBody: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: `whatsapp:${opts.from}`,
    To: `whatsapp:${opts.to}`,
    ContentSid: opts.contentSid,
    ContentVariables: JSON.stringify(opts.variables),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${opts.accountSid}:${opts.authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || `Twilio error ${res.status}`);
  }
  return { sid: json.sid as string, finalBody: (json.body as string) ?? '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_WHATSAPP_FROM');
    const contentSid = Deno.env.get('TWILIO_TEMPLATE_SID');

    if (!accountSid || !authToken || !from || !contentSid) {
      return new Response(
        JSON.stringify({
          error:
            'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, and TWILIO_TEMPLATE_SID.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate the caller and require admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const userId = claims.claims.sub as string;
    const { data: isAdminData } = await supabaseAdmin.rpc('is_admin', { _user_id: userId });
    if (!isAdminData) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as SendBody;
    const reminderIds = body.reminder_ids ?? [];
    if (reminderIds.length === 0) {
      return new Response(JSON.stringify({ error: 'reminder_ids is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: reminders, error: remError } = await supabaseAdmin
      .from('payment_reminders')
      .select('id, member_id, period_year, period_month, amount_owed, whatsapp_number, draft_message, status, member:members(full_name, whatsapp_number, whatsapp_opt_out)')
      .in('id', reminderIds);

    if (remError) throw remError;

    const results: SendResult[] = [];

    for (const r of reminders ?? []) {
      const member = (r as any).member;
      const number = (r as any).whatsapp_number || member?.whatsapp_number;

      if (!number) {
        await supabaseAdmin
          .from('payment_reminders')
          .update({
            status: 'failed',
            failure_reason: 'Falta número de WhatsApp',
            reviewed_by: userId,
          })
          .eq('id', r.id);
        results.push({ reminder_id: r.id, status: 'failed', error: 'Falta número de WhatsApp' });
        continue;
      }

      if (member?.whatsapp_opt_out) {
        await supabaseAdmin
          .from('payment_reminders')
          .update({
            status: 'dismissed',
            failure_reason: 'Miembro optó por no recibir mensajes',
            reviewed_by: userId,
          })
          .eq('id', r.id);
        results.push({
          reminder_id: r.id,
          status: 'failed',
          error: 'Miembro optó por no recibir mensajes',
        });
        continue;
      }

      const amount = Number(r.amount_owed).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      });
      const monthLabel = `${MONTH_NAMES_ES[(r.period_month as number) - 1]} ${r.period_year}`;

      try {
        const { sid, finalBody } = await sendOneViaTwilio({
          accountSid,
          authToken,
          from,
          to: number,
          contentSid,
          variables: {
            '1': member?.full_name ?? 'Hermano',
            '2': amount,
            '3': monthLabel,
          },
        });

        await supabaseAdmin
          .from('payment_reminders')
          .update({
            status: 'sent',
            twilio_message_sid: sid,
            final_message: finalBody || r.draft_message,
            sent_at: new Date().toISOString(),
            failure_reason: null,
            reviewed_by: userId,
          })
          .eq('id', r.id);

        results.push({ reminder_id: r.id, status: 'sent', twilio_message_sid: sid });
      } catch (sendErr) {
        const message = (sendErr as Error).message;
        await supabaseAdmin
          .from('payment_reminders')
          .update({
            status: 'failed',
            failure_reason: message,
            reviewed_by: userId,
          })
          .eq('id', r.id);
        results.push({ reminder_id: r.id, status: 'failed', error: message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[send-whatsapp-reminder] error', error);
    return new Response(JSON.stringify({ error: (error as Error).message || 'unexpected' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
