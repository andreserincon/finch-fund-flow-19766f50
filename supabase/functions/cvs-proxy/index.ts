import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Índice de Salarios (monthly, updated through current data)
// Series API from datos.gob.ar
const API_URL =
  "https://apis.datos.gob.ar/series/api/series/?ids=149.1_TL_INDIIOS_OCTU_0_21&format=json&limit=24&sort=desc";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({ error: `Upstream HTTP ${res.status}`, body }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await res.json();
    return new Response(JSON.stringify(json), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
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
