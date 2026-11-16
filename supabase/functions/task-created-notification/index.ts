import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";
import { taskEmailsArePaused } from "../_shared/task_email_pause.ts";

/**
 * Task Created Notification
 *
 * Called automatically by a database trigger (via pg_net) whenever a new task
 * is inserted into public.tasks. Sends an email to:
 *   - Viraj — viraj.digitalsky360@gmail.com
 *   - Kapil — kapilprajapati9054@gmail.com
 *   - Rostan — softrockind@gmail.com
 *
 * No other team members receive this email.
 */

const VERSION = "2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Trigger-Secret",
};

const MASTER_EMAILS = [
  "viraj.digitalsky360@gmail.com",
  "kapilprajapati9054@gmail.com",
  "softrockind@gmail.com",
];

interface TaskCreatedPayload {
  taskId: string;
  taskName: string;
  teamMemberName: string | null;
  clientName: string | null;
  workspaceName: string | null;
  dueDate: string | null;
  status: string;
  notes: string | null;
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
    not_started: "Not Started",
    started: "Started",
    in_progress: "In Progress",
    in_approval: "In Approval",
    approved: "Approved",
    not_approved: "Not Approved",
    pending: "Pending",
    completed: "Completed",
  };
  return labels[status] ?? status;
}

function formatDate(d: string | null): string {
  if (!d) return "No due date";
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

function buildHtml(p: TaskCreatedPayload): string {
  const notesLine = p.notes
    ? `<tr><td style="padding:6px 12px;color:#555;vertical-align:top;">Description</td><td style="padding:6px 12px;">${escapeHtml(p.notes)}</td></tr>`
    : "";

  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a1a2e;">SOFTROCK — New Task Created</h2>
    <p>A new task has been created in the CRM.</p>
    <table style="border-collapse:collapse; font-size:14px; margin:16px 0;">
      <tr><td style="padding:6px 12px;color:#555;">Task Name</td><td style="padding:6px 12px;"><strong>${escapeHtml(p.taskName)}</strong></td></tr>
      <tr><td style="padding:6px 12px;color:#555;">Assigned To</td><td style="padding:6px 12px;">${escapeHtml(p.teamMemberName ?? "Unassigned")}</td></tr>
      <tr><td style="padding:6px 12px;color:#555;">Client</td><td style="padding:6px 12px;">${escapeHtml(p.clientName ?? "No client")}</td></tr>
      <tr><td style="padding:6px 12px;color:#555;">Department</td><td style="padding:6px 12px;">${escapeHtml(p.workspaceName ?? "No workspace")}</td></tr>
      <tr><td style="padding:6px 12px;color:#555;">Task Date</td><td style="padding:6px 12px;">${escapeHtml(formatDate(p.dueDate))}</td></tr>
      <tr><td style="padding:6px 12px;color:#555;">Status</td><td style="padding:6px 12px;">${escapeHtml(statusLabel(p.status))}</td></tr>
      ${notesLine}
    </table>
    <p style="color:#888; font-size:12px; margin-top:20px;">
      This is an automated email from SOFTROCK CRM.
    </p>
  </div>`;
}

Deno.serve(async (req: Request) => {
  if (await closureModeIsEnabled(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return closureModeResponse();
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization") ?? "";
    const apiKey = req.headers.get("Apikey") ?? "";
    if (!serviceRoleKey || (authorization !== `Bearer ${serviceRoleKey}` && apiKey !== serviceRoleKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (await closureModeIsEnabled(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
    )) {
      return new Response(JSON.stringify({ error: "CRM Closure Mode is enabled." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (await taskEmailsArePaused(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
    )) {
      return new Response(JSON.stringify({ sent: false, reason: "task_email_paused" }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as TaskCreatedPayload;

    if (!body.taskId || !body.taskName) {
      return new Response(JSON.stringify({ error: "Missing required fields: taskId, taskName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;

    const subject = `SOFTROCK — New Task Created — ${body.taskName}`;
    const htmlBody = buildHtml(body);

    const sentTo: string[] = [];
    const failures: string[] = [];

    for (const email of MASTER_EMAILS) {
      try {
        const emailResponse = await fetch(sendEmailUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            to: email,
            subject,
            html: htmlBody,
            notificationType: "task_created",
            triggeredBy: "manual",
          }),
        });

        const result = await emailResponse.json().catch(() => null);
        if (emailResponse.ok && result?.sent !== false) {
          sentTo.push(email);
        } else {
          const errMsg = result?.error ?? result?.reason ?? `${emailResponse.status}`;
          failures.push(`${email}: ${errMsg}`);
        }
      } catch (err) {
        failures.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentTo.length > 0,
        version: VERSION,
        taskId: body.taskId,
        recipients: sentTo,
        failures: failures.length > 0 ? failures : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Task created notification failed", error);
    return new Response(
      JSON.stringify({ error: "Task created notification could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
