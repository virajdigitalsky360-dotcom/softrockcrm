import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeAllowsRequest, closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";

const VERSION = "1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
};

const VIRAJ_EMAIL = "viraj.digitalsky360@gmail.com";
const KAPIL_EMAIL = "kapilprajapati9054@gmail.com";
const ALLOWED_EMAILS = new Set([VIRAJ_EMAIL.toLowerCase(), KAPIL_EMAIL.toLowerCase()]);

const TEST_SUBJECT = "SOFTROCK Attendance – Test Email";

const TEST_HTML = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#d97706;">⚠ TEST EMAIL — NOT AN ACTUAL ATTENDANCE REPORT</h2>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="margin:0 0 8px 0;font-size:14px;color:#92400e;">
      <strong>This is a test email from the SOFTROCK Attendance system.</strong>
    </p>
    <p style="margin:0 0 8px 0;font-size:14px;color:#92400e;">
      This is only a test email to confirm that attendance email delivery is working correctly.
    </p>
    <p style="margin:0;font-size:14px;color:#92400e;">
      It is <strong>NOT</strong> an actual attendance report.
    </p>
  </div>
  <p style="color:#888;font-size:12px;margin-top:20px;">
    Triggered manually from the Master Panel. This email does not create attendance records, change attendance status, or count as an absence report.
  </p>
</div>`;

Deno.serve(async (req: Request) => {
  if (await closureModeIsEnabled(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return closureModeResponse();
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Require a valid authenticated user JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return new Response(JSON.stringify({ error: "Direct service role not allowed — must be a user request" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await closureModeAllowsRequest(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      authHeader,
    ))) {
      return new Response(JSON.stringify({ error: "CRM Closure Mode is enabled." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userEmail = (userData.user.email ?? "").toLowerCase();
    if (!ALLOWED_EMAILS.has(userEmail)) {
      return new Response(JSON.stringify({ error: "Only Viraj Primary Master and Kapil Master can send test attendance emails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user has the master role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    const role = (profile as unknown as { role: string } | null)?.role;
    if (role !== "master") {
      return new Response(JSON.stringify({ error: "Only Master role users can send test attendance emails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send test email to both Viraj and Kapil via the centralized send-email function
    const { data: dbCronSecret } = await supabase.rpc("get_cron_secret").maybeSingle();
    const cronSecret = dbCronSecret as unknown as string;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const recipients = [VIRAJ_EMAIL, KAPIL_EMAIL];
    const sentTo: string[] = [];
    const failures: string[] = [];

    for (const recipientEmail of recipients) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (cronSecret) {
          headers["X-Cron-Secret"] = cronSecret;
        }
        if (serviceRoleKey) {
          headers["Apikey"] = serviceRoleKey;
          headers["Authorization"] = `Bearer ${serviceRoleKey}`;
        }

        const emailResponse = await fetch(sendEmailUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            to: recipientEmail,
            subject: TEST_SUBJECT,
            html: TEST_HTML,
            notificationType: "attendance_test",
            triggeredBy: "manual",
          }),
        });

        const emailResult = await emailResponse.json().catch(() => null);
        if (emailResponse.ok && emailResult?.sent !== false) {
          sentTo.push(recipientEmail);
        } else {
          const errMsg = emailResult?.error ?? emailResult?.reason ?? `${emailResponse.status}`;
          failures.push(`${recipientEmail}: ${errMsg}`);
        }
      } catch (err) {
        failures.push(`${recipientEmail}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentTo.length > 0,
        version: VERSION,
        recipients: sentTo,
        failures: failures.length > 0 ? failures : undefined,
      }),
      {
        status: sentTo.length > 0 ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Test attendance email failed", error);
    return new Response(
      JSON.stringify({ error: "Test email could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
