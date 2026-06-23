import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Roles allowed to use the assistant (positive allowlist; staff only).
const ALLOWED_ROLES = ["treasurer", "vm", "admin"] as const;

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MONTHLY_CAP = 200;

// Fixed reply the assistant must use verbatim if asked for figures or member data.
// (Kept here only for documentation; the model is instructed to emit it. The
//  function itself never reads or sends real financial data.)
const REFUSAL_LINE =
  "Soy la guia de uso de la app: te muestro como hacer las cosas, pero no consulto ni informo saldos ni datos de los miembros. Para ver esa informacion, entra a la pantalla correspondiente (por ejemplo Miembros o Detalle financiero).";

type Turn = { role: "user" | "assistant"; content: string };

// Dependencies injected so the handler is unit testable: a factory that builds
// supabase clients, and the fetch used to reach Anthropic. Defaults use the real
// implementations; tests pass mocks.
export interface AsistenteDeps {
  createSupabaseClient: typeof createClient;
  fetchImpl: typeof fetch;
  getEnv: (key: string) => string | undefined;
}

const defaultDeps: AsistenteDeps = {
  createSupabaseClient: createClient,
  fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
  getEnv: (key: string) => Deno.env.get(key),
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Current year-month (YYYY-MM) in America/Argentina/Buenos_Aires.
function buenosAiresYearMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}

export function buildSystemPrompt(kb: string): string {
  return [
    "Sos la GUIA DE USO de esta aplicacion de tesoreria de una logia.",
    "Tu unico trabajo es explicar COMO hacer las cosas en la app, paso a paso, usando EXCLUSIVAMENTE la base de conocimiento que se te entrega abajo.",
    "",
    "Reglas estrictas:",
    "1. Nunca informes saldos, montos, importes, ni datos de miembros. No tenes acceso a esos datos y no debes inventarlos.",
    "2. Si te piden cifras, saldos, montos, deudas, o datos concretos de algun miembro, responde EXACTAMENTE con este texto y nada mas:",
    REFUSAL_LINE,
    "3. Si te preguntan como hacer algo que NO esta en la base de conocimiento, decilo con claridad (no lo sabes) y sugeri donde buscar dentro de la app. No inventes pasos.",
    "4. Solo das texto explicativo. No ejecutas acciones, no llenas formularios, no cambias datos.",
    "5. Responde en espanol, de forma clara y breve.",
    "",
    "BASE DE CONOCIMIENTO (unica fuente permitida):",
    kb,
  ].join("\n");
}

// Core handler. Pure with respect to its deps so tests can drive it.
export async function handleAsistente(
  req: Request,
  deps: AsistenteDeps = defaultDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authentication: Bearer token + JWT verification.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseAuth = deps.createSupabaseClient(
      deps.getEnv("SUPABASE_URL")!,
      deps.getEnv("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = claimsData.claims.sub;

    // 2. Authorization: positive allowlist via has_role. Staff only.
    const supabaseAdmin = deps.createSupabaseClient(
      deps.getEnv("SUPABASE_URL")!,
      deps.getEnv("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let isAllowed = false;
    for (const role of ALLOWED_ROLES) {
      const { data: hasIt, error: roleError } = await supabaseAdmin.rpc("has_role", {
        _user_id: userId,
        _role: role,
      });
      if (roleError) {
        console.error("has_role error:", roleError);
        return jsonResponse({ error: "role_check_failed" }, 500);
      }
      if (hasIt) {
        isAllowed = true;
        break;
      }
    }
    if (!isAllowed) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // 3. Parse body. Only client-provided question/turns/kb are used.
    let parsed: { question?: unknown; turns?: unknown; kb?: unknown };
    try {
      parsed = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    if (!question) {
      return jsonResponse({ error: "question is required" }, 400);
    }

    const kb = typeof parsed.kb === "string" ? parsed.kb : "";

    const rawTurns = Array.isArray(parsed.turns) ? parsed.turns : [];
    const turns: Turn[] = rawTurns
      .filter(
        (t): t is Turn =>
          !!t &&
          typeof t === "object" &&
          (t as Turn).role !== undefined &&
          ((t as Turn).role === "user" || (t as Turn).role === "assistant") &&
          typeof (t as Turn).content === "string",
      )
      .map((t) => ({ role: t.role, content: t.content }));

    // 4. Monthly cap, checked only AFTER the request is validated so a malformed
    //    or empty request never consumes quota. Atomic increment via the
    //    SECURITY DEFINER RPC, then check. Fail closed if the RPC errors or
    //    returns a non-finite number.
    const yearMonth = buenosAiresYearMonth();
    const { data: newCount, error: capError } = await supabaseAdmin.rpc(
      "increment_asistente_usage",
      { _user_id: userId, _year_month: yearMonth },
    );
    if (capError) {
      console.error("increment_asistente_usage error:", capError);
      return jsonResponse({ error: "usage_tracking_failed" }, 500);
    }
    if (typeof newCount !== "number" || !Number.isFinite(newCount)) {
      console.error("increment_asistente_usage returned non-numeric:", newCount);
      return jsonResponse({ error: "usage_tracking_failed" }, 500);
    }
    if (newCount > MONTHLY_CAP) {
      return jsonResponse({ error: "monthly_cap_reached" }, 429);
    }

    // 5. Anthropic call. The payload is built ONLY from kb + turns + question.
    const apiKey = deps.getEnv("asistente_logia");
    if (!apiKey) {
      return jsonResponse({ error: "asistente_logia is not configured" }, 500);
    }

    const anthropicBody = {
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      stream: true,
      system: buildSystemPrompt(kb),
      messages: [...turns, { role: "user", content: question }],
    };

    const response = await deps.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
      console.error("Anthropic error:", response.status, detail);
      return jsonResponse(
        { error: "anthropic_error", upstreamStatus: response.status },
        response.status,
      );
    }

    // 6. Stream the SSE response straight back to the client.
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("asistente error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
}

serve((req) => handleAsistente(req));
