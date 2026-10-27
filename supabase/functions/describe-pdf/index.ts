import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Chunked base64: the previous byte-by-byte reduce was O(n^2) and timed out on
// larger PDFs (a 1.3MB file builds a string of ~1.3M characters one char at a time).
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CLAUDE_API_KEY = Deno.env.get("asistente_logia");
    if (!CLAUDE_API_KEY) throw new Error("asistente_logia (Anthropic key) is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file_path } = await req.json();
    if (!file_path) {
      return new Response(JSON.stringify({ error: "file_path is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: allow analyzing a PDF the user just uploaded to their own
    // storage folder (the temp_ file created during "Subir PDF"), or an already
    // approved book they can read. New uploads have no digital_books row yet, so
    // requiring an approved row here was blocking the analyze-on-upload flow.
    const ownsFile = file_path.startsWith(`${user.id}/`);
    if (!ownsFile) {
      const { data: bookRecord, error: bookErr } = await supabaseUser
        .from("digital_books")
        .select("id")
        .eq("file_path", file_path)
        .eq("is_approved", true)
        .maybeSingle();

      if (bookErr || !bookRecord) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Download the PDF from storage using service role (auth already enforced above)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("digital-books")
      .download(file_path);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert PDF to base64 for the AI model.
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = toBase64(new Uint8Array(arrayBuffer));

    // Analizar el PDF con Claude Haiku (documento nativo) y pedir la metadata en JSON.
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system:
          "Sos un bibliotecario experto. Analizás el PDF y devolvés SOLO un objeto JSON con las claves title, author y description (descripción concisa en español, máximo 3 oraciones). Si no podés determinar el autor, usá \"Desconocido\". No agregues texto fuera del JSON.",
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "Extraé el título, autor y descripción de este documento. Devolvé solo el JSON." },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const body = await aiResponse.text();
      console.error("Anthropic error:", status, body.slice(0, 300));

      if (status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const raw = (aiData.content?.[0]?.text || "").trim();
    let metadata: { title?: string; author?: string; description?: string } = {};
    try {
      metadata = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    } catch {
      console.error("Failed to parse metadata JSON:", raw.slice(0, 200));
    }
    return new Response(
      JSON.stringify({
        title: metadata.title || "",
        author: metadata.author || "Desconocido",
        description: metadata.description || raw || "",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("describe-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
