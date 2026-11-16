import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRIMARY_MASTER_EMAIL = "viraj.digitalsky360@gmail.com";

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%";
  const all = upper + lower + digits + special;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const rest: string[] = [];
  for (let i = 0; i < 12; i++) rest.push(pick(all));
  const combined = [...required, ...rest];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join("");
}

Deno.serve(async (req: Request) => {
  if (await closureModeIsEnabled(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return closureModeResponse();
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Verify the caller's identity using their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Enforce: only Viraj (primary master) can use this function
    const callerEmail = (callerUser.email ?? "").toLowerCase();
    if (callerEmail !== PRIMARY_MASTER_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Forbidden: only the primary master can manage credentials" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const action: string = body.action ?? "";
    const targetUserId: string | undefined = body.userId;

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Prevent Viraj from managing his own credentials through this tool
    if (targetUserId === callerUser.id) {
      return new Response(
        JSON.stringify({ error: "Cannot manage your own credentials through this tool" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Admin client with service role for user lookups and auth updates
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Action: reset ───
    // Generate a new password, update Supabase Auth, and store encrypted in vault
    if (action === "reset") {
      const { data: targetUser, error: targetError } = await adminClient.auth.admin.getUserById(targetUserId);
      if (targetError || !targetUser.user) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const tempPassword = generateTempPassword();

      // Update Supabase Auth password
      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: tempPassword,
      });
      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to reset auth password: " + updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Store encrypted credential in vault via service-role admin client
      // The edge function has already verified the caller is Viraj, so we use
      // the admin function that accepts the caller's ID explicitly
      const { error: rpcError } = await adminClient.rpc("set_crm_credential_admin", {
        p_target_user_id: targetUserId,
        p_crm_login_id: targetUser.user.email ?? "",
        p_password: tempPassword,
        p_set_by: callerUser.id,
      });
      if (rpcError) {
        // Auth password was updated but vault storage failed — still return the password
        // so Viraj has it; vault can be re-synced later
        console.error("vault store failed", rpcError.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          temporaryPassword: tempPassword,
          userEmail: targetUser.user.email,
          userId: targetUserId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Action: getCredential ───
    // Retrieve the stored (encrypted) password from the vault, decrypted by RPC
    if (action === "getCredential") {
      const { data, error: rpcError } = await callerClient.rpc("get_crm_credential", {
        target_user_id: targetUserId,
      });
      if (rpcError) {
        return new Response(
          JSON.stringify({ error: "Failed to retrieve credential: " + rpcError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!data || data.length === 0) {
        return new Response(
          JSON.stringify({ success: true, hasCredential: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const row = data[0];
      return new Response(
        JSON.stringify({
          success: true,
          hasCredential: true,
          crmLoginId: row.crm_login_id,
          password: row.password,
          setAt: row.set_at,
          setBy: row.set_by,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Action: hasCredential ───
    // Check if a credential exists without returning the password
    if (action === "hasCredential") {
      const { data, error: rpcError } = await callerClient.rpc("has_crm_credential", {
        target_user_id: targetUserId,
      });
      if (rpcError) {
        return new Response(
          JSON.stringify({ error: "Failed to check credential" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ success: true, hasCredential: data ?? false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: reset, getCredential, hasCredential" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("admin-reset-password failed", error);
    return new Response(
      JSON.stringify({ error: "Credential operation could not be completed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
