import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  role?: "treasurer" | "vm" | "member" | "bibliotecario" | "admin";
  memberId?: string;
  masonicGrade?: "aprendiz" | "companero" | "maestro";
  redirectTo?: string;
}

// Roles a Venerable (vm) is allowed to grant. Only an admin can grant the
// higher roles (treasurer, vm, admin). This cap is enforced server-side here,
// not just hidden in the client dropdown.
const VM_GRANTABLE_ROLES = ["member", "bibliotecario"];

function generatePassword(length = 16): string {
  const charset = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => charset[b % charset.length]).join("");
}

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

    const requestingUserId = callingUser.id;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // The caller must be an admin or a Venerable (vm) to create accounts.
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUserId);

    const roles = (callerRoles ?? []).map((r: { role: string }) => r.role);
    const callerIsAdmin = roles.includes("admin");
    const callerIsVm = roles.includes("vm");

    if (!callerIsAdmin && !callerIsVm) {
      throw new Error("No autorizado: solo el Administrador o el Venerable pueden crear accesos.");
    }

    const { email, role, memberId, masonicGrade, redirectTo }: CreateUserRequest = await req.json();

    if (!email) {
      throw new Error("El correo es obligatorio.");
    }

    // Requirement: every created account must be linked to an existing member.
    if (!memberId) {
      throw new Error("Debes asociar un hermano (miembro) al acceso.");
    }

    // Role ceiling: a Venerable may only grant the lower roles.
    if (!callerIsAdmin && role && !VM_GRANTABLE_ROLES.includes(role)) {
      throw new Error("El Venerable solo puede otorgar los roles Miembro o Bibliotecario.");
    }

    // One access per member.
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("member_id", memberId)
      .maybeSingle();

    if (existingProfile) {
      throw new Error("Este hermano ya tiene un acceso vinculado. Solo puede existir un acceso por miembro.");
    }

    // Create the account (confirmed). The random password is never returned;
    // the brother sets their own via the recovery link below.
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: generatePassword(),
      email_confirm: true,
    });

    if (createError || !newUser.user) {
      const msg = (createError?.message || "").toLowerCase().includes("already")
        ? "Este correo ya tiene un acceso registrado."
        : (createError?.message || "No se pudo crear el acceso.");
      throw new Error(msg);
    }

    const newUserId = newUser.user.id;

    if (role) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: newUserId, role });
      if (roleError) console.error("Error assigning role:", roleError);
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ member_id: memberId })
      .eq("id", newUserId);
    if (profileError) console.error("Error associating member:", profileError);

    if (masonicGrade) {
      const { error: gradeError } = await adminClient
        .from("members")
        .update({ masonic_grade: masonicGrade })
        .eq("id", memberId);
      if (gradeError) console.error("Error updating grade:", gradeError);
    }

    // Generate a one-time link the officer can share (WhatsApp or in person).
    // This does NOT send an email; it just returns the link.
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (linkError) console.error("Error generating link:", linkError);
    const actionLink = linkData?.properties?.action_link ?? null;

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: newUserId, email: newUser.user.email },
        actionLink,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in admin-create-user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
