import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteUserRequest {
  userId: string;
}

// Delete a user account from auth.users. ON DELETE CASCADE removes its profile
// and its roles; the lodge member is NOT deleted. Authorized for an
// Administrator or a Venerable. Guards: nobody can delete their own account
// (prevents lockout), and a Venerable cannot delete an Administrator. Runs with
// the service role so it does not depend on per-table RLS.
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
    const callerRoleList = (callerRoles ?? []).map((r: { role: string }) => r.role);
    const callerIsAdmin = callerRoleList.includes("admin");
    const callerCanManage = callerIsAdmin || callerRoleList.includes("vm");
    if (!callerCanManage) {
      throw new Error("No autorizado: solo el Administrador o el Venerable pueden eliminar cuentas.");
    }

    const { userId }: DeleteUserRequest = await req.json();
    if (!userId) {
      throw new Error("Falta el usuario a eliminar.");
    }

    // Prevent self-deletion (lockout).
    if (userId === callingUser.id) {
      throw new Error("No podes eliminar tu propia cuenta.");
    }

    // A Venerable cannot delete an Administrator.
    const { data: targetRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const targetIsAdmin = (targetRoles ?? []).some((r: { role: string }) => r.role === "admin");
    if (targetIsAdmin && !callerIsAdmin) {
      throw new Error("No autorizado: solo un Administrador puede eliminar a otro Administrador.");
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(deleteError.message || "No se pudo eliminar la cuenta.");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in admin-delete-user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
