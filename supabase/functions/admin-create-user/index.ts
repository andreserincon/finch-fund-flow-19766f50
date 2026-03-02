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
}

function generatePassword(length = 12): string {
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
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !callingUser) {
      throw new Error("Unauthorized: Invalid token");
    }

    const requestingUserId = callingUser.id;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      throw new Error("Unauthorized: Only administrators can create users");
    }

    const { email, role, memberId, masonicGrade }: CreateUserRequest = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    const generatedPassword = generatePassword();

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
    });

    if (createError) {
      console.error("Error creating user:", createError);
      throw new Error(createError.message);
    }

    console.log("User created successfully:", newUser.user?.id);

    // Assign role if provided
    if (role && newUser.user) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: newUser.user.id, role });

      if (roleError) {
        console.error("Error assigning role:", roleError);
      }
    }

    // Associate member if provided
    if (memberId && newUser.user) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ member_id: memberId })
        .eq("id", newUser.user.id);

      if (profileError) {
        console.error("Error associating member:", profileError);
      }

      // Update masonic grade on the member if provided
      if (masonicGrade) {
        const { error: gradeError } = await adminClient
          .from("members")
          .update({ masonic_grade: masonicGrade })
          .eq("id", memberId);

        if (gradeError) {
          console.error("Error updating grade:", gradeError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user?.id,
          email: newUser.user?.email,
        },
        generatedPassword,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in admin-create-user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
