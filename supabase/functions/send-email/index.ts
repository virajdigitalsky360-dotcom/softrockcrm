import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeAllowsRequest, closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";
import { isTaskNotificationType, taskEmailsArePaused } from "../_shared/task_email_pause.ts";

/**
 * Centralized Email Sender
 *
 * Sends all emails for the CRM. Routes to the correct Resend API key
 * based on the recipient:
 *   - kapilprajapati9054@gmail.com → RESEND_API_KEY_KAPIL (Kapil's Resend account)
 *   - all other recipients         → RESEND_API_KEY (default / Viraj's Resend account)
 *
 * Called by other edge functions via internal fetch, and from the frontend (master only).
 *
 * Body:
 *   { to: string, subject: string, html: string,
 *     notificationType: string, teamMemberId?: string,
 *     triggeredBy?: "cron" | "manual" }
 */

const VERSION = "2.0.0";
const PRIMARY_MASTER_EMAIL = "viraj.digitalsky360@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
};

const KAPIL_EMAIL = "kapilprajapati9054@gmail.com";
const ROSTAN_EMAIL = "softrockind@gmail.com";

interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
  notificationType: string;
  teamMemberId?: string | null;
  triggeredBy?: "cron" | "manual";
}

interface ResendConfig {
  apiKey: string;
  fromAddr: string;
  keyLabel: string;
}

async function getResendConfig(recipient: string, supabase: ReturnType<typeof createClient>): Promise<ResendConfig> {
  const lower = recipient.toLowerCase();

  if (lower === KAPIL_EMAIL) {
    const kapilKey = Deno.env.get("RESEND_API_KEY_KAPIL");
    if (kapilKey) {
      const { data: dbFrom } = await supabase
        .from("cron_secrets")
        .select("value")
        .eq("key", "RESEND_FROM_EMAIL_KAPIL")
        .maybeSingle();
      const kapilFrom = (dbFrom as unknown as { value: string } | null)?.value ?? "";
      return {
        apiKey: kapilKey,
        fromAddr: kapilFrom,
        keyLabel: "RESEND_API_KEY_KAPIL",
      };
    }
  }

  if (lower === ROSTAN_EMAIL) {
    const rostanKey = Deno.env.get("RESEND_API_KEY_ROSTAN");
    if (rostanKey) {
      const { data: dbFrom } = await supabase
        .from("cron_secrets")
        .select("value")
        .eq("key", "RESEND_FROM_EMAIL_ROSTAN")
        .maybeSingle();
      const rostanFrom = (dbFrom as unknown as { value: string } | null)?.value ?? "";
      return {
        apiKey: rostanKey,
        fromAddr: rostanFrom,
        keyLabel: "RESEND_API_KEY_ROSTAN",
      };
    }
  }

  const defaultKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const defaultFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  return { apiKey: defaultKey, fromAddr: defaultFrom, keyLabel: "RESEND_API_KEY" };
}

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

    // Auth check: cron secret OR service role key (Apikey/Authorization) OR authenticated user JWT
    const cronSecretHeader = req.headers.get("X-Cron-Secret");
    const authHeader = req.headers.get("Authorization") ?? "";
    const apikeyHeader = req.headers.get("Apikey") ?? "";

    if (cronSecretHeader) {
      const { data: dbSecret, error: secretError } = await supabase
        .rpc("get_cron_secret")
        .maybeSingle();
      const cronSecret = dbSecret as unknown as string;
      if (secretError || !cronSecret || cronSecretHeader !== cronSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (await closureModeIsEnabled(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      )) {
        return new Response(JSON.stringify({ error: "CRM Closure Mode is enabled." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (apikeyHeader && apikeyHeader === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      // Service role key — allow (internal function-to-function calls)
    } else if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
        // Service role key — allow
      } else {
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData.user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (userData.user.email?.toLowerCase() !== PRIMARY_MASTER_EMAIL) {
          return new Response(JSON.stringify({ error: "Only the Primary Master can send email directly." }), {
            status: 403,
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
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as SendEmailPayload;

    if (!body.to || !body.subject || !body.html || !body.notificationType) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html, notificationType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (isTaskNotificationType(body.notificationType) && await taskEmailsArePaused(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )) {
      return new Response(
        JSON.stringify({ sent: false, reason: "task_email_paused", recipient: body.to }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const triggeredBy = body.triggeredBy ?? "cron";
    const teamMemberId = body.teamMemberId ?? null;

    // Check notification settings — if a team_member_id is provided, look up their settings
    if (teamMemberId) {
      const { data: settings } = await supabase
        .from("email_notification_settings")
        .select("*")
        .eq("team_member_id", teamMemberId)
        .maybeSingle();

      if (settings) {
        if (!settings.email_enabled) {
          return new Response(
            JSON.stringify({ sent: false, reason: "email_disabled_for_user", recipient: body.to }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const typeField = `notify_${body.notificationType}`;
        if (typeField in settings && settings[typeField] === false) {
          return new Response(
            JSON.stringify({ sent: false, reason: `notification_type_disabled: ${body.notificationType}`, recipient: body.to }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Route to the correct Resend API key based on recipient
    const config = await getResendConfig(body.to, supabase);

    if (!config.apiKey) {
      await supabase.from("centralized_email_logs").insert({
        recipient_email: body.to,
        team_member_id: teamMemberId,
        notification_type: body.notificationType,
        subject: body.subject,
        status: "failed",
        error_message: `${config.keyLabel} not configured`,
        triggered_by: triggeredBy,
      }).then(() => {});

      return new Response(
        JSON.stringify({ sent: false, reason: "email_not_configured", error: `${config.keyLabel} not configured`, keyUsed: config.keyLabel }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!config.fromAddr) {
      await supabase.from("centralized_email_logs").insert({
        recipient_email: body.to,
        team_member_id: teamMemberId,
        notification_type: body.notificationType,
        subject: body.subject,
        status: "failed",
        error_message: "RESEND_FROM_EMAIL not configured",
        triggered_by: triggeredBy,
      }).then(() => {});

      return new Response(
        JSON.stringify({ sent: false, reason: "email_not_configured", error: "RESEND_FROM_EMAIL not configured", keyUsed: config.keyLabel }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let emailStatus = "sent";
    let emailError: string | null = null;
    let messageId: string | null = null;

    try {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.fromAddr,
          to: [body.to],
          subject: body.subject,
          html: body.html,
        }),
      });

      if (emailResponse.ok) {
        const respJson = await emailResponse.json().catch(() => null);
        messageId = respJson?.id ?? null;
      } else {
        const respBody = await emailResponse.text();
        emailStatus = "failed";
        emailError = `${emailResponse.status} ${respBody}`;
      }
    } catch (err) {
      emailStatus = "failed";
      emailError = err instanceof Error ? err.message : String(err);
    }

    await supabase.from("centralized_email_logs").insert({
      recipient_email: body.to,
      team_member_id: teamMemberId,
      notification_type: body.notificationType,
      subject: body.subject,
      status: emailStatus,
      error_message: emailError,
      resend_message_id: messageId,
      triggered_by: triggeredBy,
    }).then(() => {});

    return new Response(
      JSON.stringify({
        sent: emailStatus === "sent",
        version: VERSION,
        recipient: body.to,
        status: emailStatus,
        messageId,
        error: emailError,
        keyUsed: config.keyLabel,
      }),
      {
        status: emailStatus === "sent" ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Centralized email sender failed", error);
    return new Response(
      JSON.stringify({ error: "Email could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
