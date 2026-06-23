import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type AsistenteDeps, buildSystemPrompt, handleAsistente } from "./index.ts";

// ---------------------------------------------------------------------------
// Test scaffolding: a mock supabase client factory and a mock fetch.
// No real network, no real DB.
// ---------------------------------------------------------------------------

interface MockOptions {
  // getClaims behaviour: provide claims (authenticated) or simulate failure.
  claims?: { sub: string } | null;
  claimsError?: boolean;
  // has_role responses keyed by role name.
  roles?: Partial<Record<string, boolean>>;
  // simulate a has_role RPC infrastructure error.
  roleRpcError?: boolean;
  // increment_asistente_usage return value (the NEW count).
  usageCount?: number;
  // simulate increment_asistente_usage returning a non-numeric value.
  usageNonNumber?: boolean;
  // Anthropic upstream response.
  anthropicStatus?: number;
  anthropicBodyText?: string;
}

function makeEnv(): (key: string) => string | undefined {
  const env: Record<string, string> = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    asistente_logia: "test-anthropic-key",
  };
  return (key: string) => env[key];
}

// Captures the outgoing Anthropic request body for assertions.
interface Captured {
  anthropicCalled: boolean;
  anthropicUrl?: string;
  anthropicBody?: string;
  incrementCalled: boolean;
}

function buildDeps(opts: MockOptions): { deps: AsistenteDeps; captured: Captured } {
  const captured: Captured = { anthropicCalled: false, incrementCalled: false };

  const createSupabaseClient = ((_url: string, _key: string, _options?: unknown) => {
    return {
      auth: {
        getClaims: (_token: string) => {
          if (opts.claimsError) {
            return Promise.resolve({ data: null, error: { message: "bad jwt" } });
          }
          if (opts.claims === null) {
            return Promise.resolve({ data: { claims: null }, error: null });
          }
          return Promise.resolve({
            data: { claims: opts.claims ?? { sub: "user-123" } },
            error: null,
          });
        },
      },
      rpc: (fn: string, params: Record<string, unknown>) => {
        if (fn === "has_role") {
          if (opts.roleRpcError) {
            return Promise.resolve({ data: null, error: { message: "rpc down" } });
          }
          const role = params._role as string;
          const has = opts.roles?.[role] ?? false;
          return Promise.resolve({ data: has, error: null });
        }
        if (fn === "increment_asistente_usage") {
          captured.incrementCalled = true;
          if (opts.usageNonNumber) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: opts.usageCount ?? 1, error: null });
        }
        return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
      },
    };
    // deno-lint-ignore no-explicit-any
  }) as any;

  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    captured.anthropicCalled = true;
    captured.anthropicUrl = String(url);
    captured.anthropicBody = init?.body ? String(init.body) : undefined;
    const status = opts.anthropicStatus ?? 200;
    const body = opts.anthropicBodyText ?? "data: {}\n\n";
    return Promise.resolve(
      new Response(body, {
        status,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;

  const deps: AsistenteDeps = {
    createSupabaseClient,
    fetchImpl,
    getEnv: makeEnv(),
  };

  return { deps, captured };
}

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) headers["Authorization"] = "Bearer fake-jwt-token";
  return new Request("https://edge/asistente", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const CLEAN_BODY = {
  question: "Como registro un nuevo miembro en la app?",
  turns: [
    { role: "user", content: "Donde esta el menu principal?" },
    { role: "assistant", content: "En la barra lateral izquierda." },
  ],
  kb: "Para registrar un miembro: entra a Miembros, toca Agregar, completa el formulario.",
};

// ---------------------------------------------------------------------------
// TEST 1: payload purity. The function adds no financial/member context.
// ---------------------------------------------------------------------------

Deno.test("payload purity: outgoing Anthropic body contains only kb + turns + question", async () => {
  const { deps, captured } = buildDeps({
    roles: { treasurer: true },
    usageCount: 1,
  });

  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 200);
  assert(captured.anthropicCalled, "Anthropic should have been called");

  const sent = captured.anthropicBody ?? "";
  const parsed = JSON.parse(sent);

  // Top-level keys are exactly the ones we control.
  const keys = Object.keys(parsed).sort();
  assertEquals(keys, ["max_tokens", "messages", "model", "stream", "system"]);

  // messages = prior turns + final user question, nothing else.
  assertEquals(parsed.messages, [
    ...CLEAN_BODY.turns,
    { role: "user", content: CLEAN_BODY.question },
  ]);

  // The system prompt is EXACTLY the scope fence built from the client kb,
  // which proves the function injects no financial/member data of its own.
  // (The fence text itself contains the word "saldos" as part of forbidding
  // it, so a naive substring scan would false-positive; exact equality is the
  // correct, stronger invariant.)
  assertEquals(parsed.system, buildSystemPrompt(CLEAN_BODY.kb));

  // Belt and suspenders: the serialized messages (client-controlled content)
  // carry no service credentials or DB-table names injected by the function.
  const messagesText = JSON.stringify(parsed.messages).toLowerCase();
  for (const forbidden of ["service-key", "service_role", "member_balances"]) {
    assert(
      !messagesText.includes(forbidden),
      `messages must not contain injected token "${forbidden}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// TEST 2: per-role gate.
// ---------------------------------------------------------------------------

Deno.test("role gate: treasurer reaches Anthropic (200)", async () => {
  const { deps, captured } = buildDeps({ roles: { treasurer: true }, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 200);
  assert(captured.anthropicCalled);
});

Deno.test("role gate: vm reaches Anthropic (200)", async () => {
  const { deps, captured } = buildDeps({ roles: { vm: true }, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 200);
  assert(captured.anthropicCalled);
});

Deno.test("role gate: admin reaches Anthropic (200)", async () => {
  const { deps, captured } = buildDeps({ roles: { admin: true }, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 200);
  assert(captured.anthropicCalled);
});

Deno.test("role gate: member-only is forbidden (403), Anthropic not called", async () => {
  const { deps, captured } = buildDeps({ roles: { member: true }, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "Forbidden");
  assert(!captured.anthropicCalled);
});

Deno.test("role gate: bibliotecario-only is forbidden (403)", async () => {
  const { deps, captured } = buildDeps({ roles: { bibliotecario: true }, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 403);
  assert(!captured.anthropicCalled);
});

Deno.test("role gate: no roles at all is forbidden (403)", async () => {
  const { deps, captured } = buildDeps({ roles: {}, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 403);
  assert(!captured.anthropicCalled);
});

Deno.test("auth: missing Authorization header is 401", async () => {
  const { deps, captured } = buildDeps({ roles: { treasurer: true }, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY, false), deps);
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "Unauthorized");
  assert(!captured.anthropicCalled);
});

Deno.test("auth: invalid JWT (getClaims error) is 401", async () => {
  const { deps, captured } = buildDeps({
    claimsError: true,
    roles: { treasurer: true },
    usageCount: 1,
  });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 401);
  assert(!captured.anthropicCalled);
});

// ---------------------------------------------------------------------------
// TEST 3: monthly cap.
// ---------------------------------------------------------------------------

Deno.test("cap: 201st request returns 429 and does not call Anthropic", async () => {
  const { deps, captured } = buildDeps({ roles: { treasurer: true }, usageCount: 201 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error, "monthly_cap_reached");
  assert(!captured.anthropicCalled, "Anthropic must NOT be called when capped");
});

Deno.test("cap: count at the limit (200) still proceeds to Anthropic", async () => {
  const { deps, captured } = buildDeps({ roles: { treasurer: true }, usageCount: 200 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 200);
  assert(captured.anthropicCalled);
});

// ---------------------------------------------------------------------------
// Extra: body validation.
// ---------------------------------------------------------------------------

Deno.test("body: missing question is 400 and does not consume quota", async () => {
  const { deps, captured } = buildDeps({ roles: { treasurer: true }, usageCount: 1 });
  const res = await handleAsistente(
    makeRequest({ kb: "some kb", turns: [] }),
    deps,
  );
  assertEquals(res.status, 400);
  assert(!captured.anthropicCalled);
  assert(!captured.incrementCalled, "a 400 must not consume the monthly quota");
});

Deno.test("body: empty question is 400", async () => {
  const { deps, captured } = buildDeps({ roles: { treasurer: true }, usageCount: 1 });
  const res = await handleAsistente(
    makeRequest({ question: "   ", kb: "some kb" }),
    deps,
  );
  assertEquals(res.status, 400);
  assert(!captured.anthropicCalled);
});

// ---------------------------------------------------------------------------
// Extra: Anthropic upstream error passthrough.
// ---------------------------------------------------------------------------

Deno.test("anthropic upstream 401 is surfaced with upstream status", async () => {
  const { deps } = buildDeps({
    roles: { treasurer: true },
    usageCount: 1,
    anthropicStatus: 401,
    anthropicBodyText: "unauthorized",
  });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "anthropic_error");
  assertEquals(body.upstreamStatus, 401);
});

// ---------------------------------------------------------------------------
// Extra: missing asistente_logia secret is 500.
// ---------------------------------------------------------------------------

Deno.test("missing asistente_logia secret returns 500", async () => {
  const { deps, captured } = buildDeps({ roles: { treasurer: true }, usageCount: 1 });
  // Override env to drop the key.
  const baseEnv = deps.getEnv;
  deps.getEnv = (key: string) => (key === "asistente_logia" ? undefined : baseEnv(key));
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 500);
  assertStringIncludes((await res.json()).error, "asistente_logia");
  assert(!captured.anthropicCalled);
});

// ---------------------------------------------------------------------------
// Hardening: fail closed on infrastructure faults.
// ---------------------------------------------------------------------------

Deno.test("role gate: a has_role RPC error fails closed with 500", async () => {
  const { deps, captured } = buildDeps({ roleRpcError: true, usageCount: 1 });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "role_check_failed");
  assert(!captured.anthropicCalled);
});

Deno.test("cap: a non-numeric usage count fails closed with 500", async () => {
  const { deps, captured } = buildDeps({
    roles: { treasurer: true },
    usageNonNumber: true,
  });
  const res = await handleAsistente(makeRequest(CLEAN_BODY), deps);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "usage_tracking_failed");
  assert(!captured.anthropicCalled);
});
