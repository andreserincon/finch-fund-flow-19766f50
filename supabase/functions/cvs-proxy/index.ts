import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CSV_URL =
  "https://infra.datos.gob.ar/catalog/sspm/dataset/447/distribution/447.1/download/coeficiente-de-variacion-salarial.csv";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Upstream HTTP ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const text = await res.text();
    return new Response(text, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
