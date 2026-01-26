import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetPasswordRequest {
  email: string;
  redirectUrl: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the requesting user is a treasurer
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's token to verify they're a treasurer
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized: Invalid user token");
    }

    // Check if user is a treasurer
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "treasurer") {
      throw new Error("Unauthorized: Only treasurers can reset passwords");
    }

    // Parse request body
    const { email, redirectUrl }: ResetPasswordRequest = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    console.log(`Treasurer ${user.email} requesting password reset for: ${email}`);

    // Create admin client to send password reset
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Send password reset email using admin client
    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: redirectUrl || `${supabaseUrl.replace('.supabase.co', '.lovableproject.com')}/auth`,
      }
    );

    if (resetError) {
      console.error("Password reset error:", resetError);
      throw new Error(`Failed to send password reset: ${resetError.message}`);
    }

    console.log(`Password reset email sent successfully to: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Password reset email sent to ${email}` 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in reset-password function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: error.message.includes("Unauthorized") ? 403 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
