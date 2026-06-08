import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateUserRequest {
  userId: string;
  role?: "treasurer" | "vm" | "member" | "bibliotecario" | "admin" | null;
  memberId?: string | null;
  masonicGrade?: "aprendiz" | "companero" | "maestro" | null;
}

// Update an existing user's role, member association and grade. Authorized for
// an Administrator or a Venerable. Runs with the service role so it does not
// depend on per-table RLS, and the authorization is checked here explicitly.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No autorizado.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !callingUser) {
      throw new Error("No autorizado: token invalido.");
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id);

    const roles = (callerRoles ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes("admin") && !roles.includes("vm")) {
      throw new Error("No autorizado: solo el Administrador o el Venerable pueden editar accesos.");
    }

    const { userId, role, memberId, masonicGrade }: UpdateUserRequest = await req.json();
    if (!userId) {
      throw new Error("Falta el usuario.");
    }

    // Role: set exactly one role (or none). Replace any existing rows.
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    if (role) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (roleError) console.error("Error assigning role:", roleError);
    }

    // Member association.
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ member_id: memberId ?? null })
      .eq("id", userId);
    if (profileError) console.error("Error updating member association:", profileError);

    // Masonic grade on the associated member.
    if (memberId && masonicGrade) {
      const { error: gradeError } = await adminClient
        .from("members")
        .update({ masonic_grade: masonicGrade })
        .eq("id", memberId);
      if (gradeError) console.error("Error updating grade:", gradeError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in admin-update-user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
