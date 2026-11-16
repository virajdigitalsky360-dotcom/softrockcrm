import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";

const VERSION = "3.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Trigger-Secret",
};

const PRIMARY_MASTER_EMAIL = "viraj.digitalsky360@gmail.com";
const KAPIL_EMAIL = "kapilprajapati9054@gmail.com";

interface LeavePayload {
  leaveId?: string;
  employeeName: string;
  employeeEmail: string | null;
  fromDate: string;
  toDate: string;
  dayType: string;
  reason: string | null;
  status: string;
  event: "created" | "approved" | "rejected" | "updated";
  rejectionReason?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };
  return labels[status] ?? status;
}

function formatDate(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function buildSubject(p: LeavePayload): string {
  const tag =
    p.event === "created" ? "New Leave Request" :
    p.event === "approved" ? "Leave Approved" :
    p.event === "rejected" ? "Leave Rejected" :
    "Leave Updated";
  return `SOFTROCK — ${tag} — ${p.employeeName}`;
}

function buildHtml(p: LeavePayload): string {
  const sameDay = p.fromDate === p.toDate;
  const dateLine = sameDay
    ? `Leave date: <strong>${formatDate(p.fromDate)}</strong>`
    : `Start date: <strong>${formatDate(p.fromDate)}</strong><br>End date: <strong>${formatDate(p.toDate)}</strong>`;
  const dayTypeLabel = p.dayType === "half" ? "Half Day" : "Full Day";

  let heading: string;
  let intro: string;
  if (p.event === "created") {
    heading = "New Leave Request";
    intro = `A leave request has been added for <strong>${escapeHtml(p.employeeName)}</strong>.`;
  } else if (p.event === "approved") {
    heading = "Leave Approved";
    intro = `The leave request for <strong>${escapeHtml(p.employeeName)}</strong> has been <strong style="color:#16a34a;">approved</strong>.`;
  } else if (p.event === "rejected") {
    heading = "Leave Rejected";
    intro = `The leave request for <strong>${escapeHtml(p.employeeName)}</strong> has been <strong style="color:#dc2626;">rejected</strong>.`;
  } else {
    heading = "Leave Updated";
    intro = `The leave request for <strong>${escapeHtml(p.employeeName)}</strong> has been updated.`;
  }

  const reasonLine = p.reason
    ? `<tr><td style="padding:6px 12px;color:#555;">Reason</td><td style="padding:6px 12px;">${escapeHtml(p.reason)}</td></tr>`
    : "";

  const rejectionLine =
    p.event === "rejected" && p.rejectionReason
      ? `<tr><td style="padding:6px 12px;color:#555;">Rejection Reason</td><td style="padding:6px 12px;">${escapeHtml(p.rejectionReason)}</td></tr>`
      : "";

  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a1a2e;">SOFTROCK — ${heading}</h2>
    <p>${intro}</p>
    <table style="border-collapse:collapse; font-size:14px; margin:16px 0;">
      <tr><td style="padding:6px 12px;color:#555;">Employee</td><td style="padding:6px 12px;">${escapeHtml(p.employeeName)}</td></tr>
      <tr><td style="padding:6px 12px;color:#555;">Dates</td><td style="padding:6px 12px;">${dateLine}</td></tr>
      <tr><td style="padding:6px 12px;color:#555;">Leave Type</td><td style="padding:6px 12px;">${dayTypeLabel}</td></tr>
      ${reasonLine}
      ${rejectionLine}
      <tr><td style="padding:6px 12px;color:#555;">Current Status</td><td style="padding:6px 12px;">${escapeHtml(statusLabel(p.status))}</td></tr>
    </table>
    <p style="color:#888; font-size:12px; margin-top:20px;">
      This is an automated email from SOFTROCK CRM.
    </p>
  </div>`;
}

async function sendViaCentralizedEmail(
  sendEmailUrl: string,
  cronSecret: string,
  serviceRoleKey: string,
  to: string,
  subject: string,
  htmlBody: string,
  teamMemberId: string | null,
): Promise<{ ok: boolean; error: string | null; messageId: string | null }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cronSecret) {
      headers["X-Cron-Secret"] = cronSecret;
    }
    // Also pass Apikey as fallback in case send-email still has verifyJWT=true
    if (serviceRoleKey) {
      headers["Apikey"] = serviceRoleKey;
      headers["Authorization"] = `Bearer ${serviceRoleKey}`;
    }

    const emailResponse = await fetch(sendEmailUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to,
        subject,
        html: htmlBody,
        notificationType: "leave_event",
        teamMemberId,
        triggeredBy: "manual",
      }),
    });

    const result = await emailResponse.json().catch(() => null);
    if (emailResponse.ok && result?.sent !== false) {
      return { ok: true, error: null, messageId: result?.messageId ?? null };
    }
    const errMsg = result?.error ?? result?.reason ?? `${emailResponse.status}`;
    return { ok: false, error: errMsg, messageId: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), messageId: null };
  }
}

Deno.serve(async (req: Request) => {
  if (await closureModeIsEnabled(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return closureModeResponse();
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (await closureModeIsEnabled(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )) {
      return new Response(JSON.stringify({ error: "CRM Closure Mode is enabled." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as LeavePayload;

    if (!body.employeeName || !body.fromDate || !body.toDate) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const subject = buildSubject(body);
    const htmlBody = buildHtml(body);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;

    // Read CRON_SECRET from the database so we can authenticate to send-email
    const { data: dbCronSecret } = await supabase.rpc("get_cron_secret").maybeSingle();
    const cronSecret = dbCronSecret as unknown as string;

    // Build the full list of recipients to attempt
    type RecipientAttempt = { email: string; teamMemberId: string | null };
    const attempts: RecipientAttempt[] = [
      { email: PRIMARY_MASTER_EMAIL, teamMemberId: null },
      { email: KAPIL_EMAIL, teamMemberId: null },
    ];

    const employeeEmail = body.employeeEmail?.trim();
    if (employeeEmail &&
        employeeEmail.toLowerCase() !== PRIMARY_MASTER_EMAIL &&
        employeeEmail.toLowerCase() !== KAPIL_EMAIL) {
      attempts.push({ email: employeeEmail, teamMemberId: null });
    }

    // Look up team member ids for notification settings
    const { data: virajMember } = await supabase
      .from("team_members")
      .select("id")
      .ilike("email", PRIMARY_MASTER_EMAIL)
      .maybeSingle();
    if (virajMember?.id) attempts[0].teamMemberId = virajMember.id;

    const { data: kapilMember } = await supabase
      .from("team_members")
      .select("id")
      .ilike("email", KAPIL_EMAIL)
      .maybeSingle();
    if (kapilMember?.id) attempts[1].teamMemberId = kapilMember.id;

    // Look up the employee's team member id
    if (employeeEmail) {
      const { data: empMember } = await supabase
        .from("team_members")
        .select("id")
        .ilike("email", employeeEmail)
        .maybeSingle();
      if (empMember?.id) attempts[attempts.length - 1].teamMemberId = empMember.id;
    }

    const sentTo: string[] = [];
    const failures: string[] = [];
    const logRows: Array<{
      leave_id: string | null;
      employee_name: string;
      event_type: string;
      recipient_email: string;
      send_status: string;
      error_message: string | null;
      resend_message_id: string | null;
    }> = [];

    for (const attempt of attempts) {
      const result = await sendViaCentralizedEmail(
        sendEmailUrl,
        cronSecret,
        serviceRoleKey,
        attempt.email,
        subject,
        htmlBody,
        attempt.teamMemberId,
      );
      if (result.ok) {
        sentTo.push(attempt.email);
      } else {
        failures.push(`${attempt.email}: ${result.error}`);
      }
      logRows.push({
        leave_id: body.leaveId ?? null,
        employee_name: body.employeeName,
        event_type: body.event,
        recipient_email: attempt.email,
        send_status: result.ok ? "sent" : "failed",
        error_message: result.error,
        resend_message_id: result.messageId,
      });
    }

    // Save one log row per recipient
    if (logRows.length > 0) {
      const { error: logError } = await supabase.from("leave_email_logs").insert(logRows);
      if (logError) {
        console.error("Failed to write leave_email_logs", logError);
      }
    }

    const emailOk = sentTo.length > 0;
    const emailError = failures.length > 0 ? failures.join("; ") : null;

    return new Response(
      JSON.stringify({
        sent: emailOk,
        version: VERSION,
        event: body.event,
        recipients: sentTo,
        failures: failures.length > 0 ? failures : undefined,
        error: emailError,
        logged: logRows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Leave notification failed", error);
    return new Response(
      JSON.stringify({ error: "Leave notification could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
