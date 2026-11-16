import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeAllowsRequest, closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";
import { taskEmailsArePaused } from "../_shared/task_email_pause.ts";

const VERSION = "2.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
};

const PENDING_STATUSES = [
  "not_started",
  "started",
  "in_progress",
  "changes_required",
  "not_approved",
];

const ROSTAN_EMAIL = "softrockind@gmail.com";

interface TaskRow {
  name: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  client: { name: string } | null;
  team_member: { name: string } | null;
}

function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    not_started: "Not Started",
    started: "Started",
    in_progress: "In Progress",
    changes_required: "Changes Required",
    not_approved: "Not Approved",
  };
  return labels[status] ?? status;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildHtml(tasks: TaskRow[], date: string): string {
  const rows = tasks.map((task) => `
    <tr>
      <td>${escapeHtml(task.name)}</td>
      <td>${escapeHtml(task.client?.name ?? "No client")}</td>
      <td>${escapeHtml(task.team_member?.name ?? "Unassigned")}</td>
      <td>${escapeHtml(statusLabel(task.status))}</td>
      <td>${escapeHtml(task.due_date ?? "No due date")}</td>
      <td>${escapeHtml(task.notes ?? "")}</td>
    </tr>`).join("");

  return `<p>All pending tasks due on ${date} (India time), across every team member.</p>
  <p><strong>Total pending tasks: ${tasks.length}</strong></p>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
    <thead><tr><th>Task Name</th><th>Client</th><th>Assigned Person</th><th>Status</th><th>Due Date</th><th>Notes</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function taskDetailsJson(tasks: TaskRow[]) {
  return tasks.map((t) => ({
    name: t.name,
    client: t.client?.name ?? null,
    assigned_person: t.team_member?.name ?? null,
    status: statusLabel(t.status),
    due_date: t.due_date,
    notes: t.notes,
  }));
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
    // Determine trigger mode: cron (X-Cron-Secret) or manual (Authorization Bearer)
    const cronSecretHeader = req.headers.get("X-Cron-Secret");
    const authHeader = req.headers.get("Authorization") ?? "";
    let isManual = false;

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
    } else if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
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
      isManual = true;
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (await taskEmailsArePaused(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )) {
      return new Response(JSON.stringify({ sent: false, reason: "task_email_paused" }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const triggerMode = isManual ? "manual" : "cron";
    const date = indiaDate();

    // Holiday/Sunday check — skip ALL pending task logic on holidays and Sundays
    const todayDateObj = new Date(date + "T12:00:00+05:30");
    const isSunday = todayDateObj.getDay() === 0;
    let holidayName: string | null = null;
    if (!isSunday) {
      const { data: holidayData } = await supabase
        .from("office_holidays")
        .select("id, holiday_name")
        .eq("holiday_date", date)
        .eq("is_active", true)
        .maybeSingle();
      if (holidayData) holidayName = holidayData.holiday_name as string;
    }
    if (isSunday || holidayName) {
      return new Response(
        JSON.stringify({ sent: false, reason: isSunday ? "sunday_skip" : "holiday_skip", date, holiday: holidayName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cron mode: dedup — one alert per India day
    if (!isManual) {
      const { data: claimed, error: claimError } = await supabase
        .from("rostan_task_alerts")
        .insert({ alert_date: date, task_count: 0 })
        .select("alert_date")
        .maybeSingle();

      if (claimError || !claimed) {
        return new Response(JSON.stringify({ sent: false, reason: "already_sent" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch ALL pending tasks due today, across every team member (same as Master report)
    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("name, status, due_date, notes, client:clients(name), team_member:team_members(name)")
      .eq("due_date", date)
      .in("status", PENDING_STATUSES)
      .order("team_member(name)", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (taskError) throw taskError;

    const pendingTasks = (taskData ?? []) as unknown as TaskRow[];

    if (pendingTasks.length === 0) {
      if (!isManual) {
        await supabase
          .from("rostan_task_alerts")
          .update({ task_count: 0 })
          .eq("alert_date", date);
      }
      return new Response(
        JSON.stringify({ sent: false, reason: "no_pending_tasks", taskCount: 0, date }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send email via centralized email function (uses single RESEND_API_KEY)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;

    // Read CRON_SECRET from the database so we can authenticate to send-email
    const { data: dbCronSecret } = await supabase.rpc("get_cron_secret").maybeSingle();
    const cronSecret = dbCronSecret as unknown as string;

    // Look up Rostan's team_member_id for notification settings check
    const { data: rostanMember } = await supabase
      .from("team_members")
      .select("id")
      .ilike("name", "Rostan")
      .maybeSingle();
    const rostanTeamMemberId = rostanMember?.id ?? null;

    const subject = `SOFTROCK — Daily Pending Tasks Report — ${date}`;
    const htmlBody = buildHtml(pendingTasks, date);

    let emailStatus = "sent";
    let emailError: string | null = null;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (cronSecret) {
        headers["X-Cron-Secret"] = cronSecret;
      }
      // Also pass service role key as fallback in case send-email still has verifyJWT=true
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (serviceRoleKey) {
        headers["Apikey"] = serviceRoleKey;
        headers["Authorization"] = `Bearer ${serviceRoleKey}`;
      }

      const emailResponse = await fetch(sendEmailUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: ROSTAN_EMAIL,
          subject,
          html: htmlBody,
          notificationType: "pending_tasks",
          teamMemberId: rostanTeamMemberId,
          triggeredBy: triggerMode,
        }),
      });

      const emailResult = await emailResponse.json().catch(() => null);
      if (!emailResponse.ok || emailResult?.sent === false) {
        emailStatus = "failed";
        emailError = emailResult?.error ?? emailResult?.reason ?? `${emailResponse.status}`;
      }
    } catch (err) {
      emailStatus = "failed";
      emailError = err instanceof Error ? err.message : String(err);
    }

    // Log the attempt to legacy table
    await supabase.from("rostan_email_logs").insert({
      recipient_email: ROSTAN_EMAIL,
      task_count: pendingTasks.length,
      task_details: taskDetailsJson(pendingTasks),
      status: emailStatus,
      error_message: emailError,
      triggered_by: triggerMode,
    });

    if (emailStatus === "failed") {
      console.error("Rostan pending task alert — email send failed:", emailError);
    }

    // Update dedup counter (cron mode only)
    if (!isManual) {
      await supabase
        .from("rostan_task_alerts")
        .update({ task_count: pendingTasks.length })
        .eq("alert_date", date);
    }

    return new Response(
      JSON.stringify({
        sent: true,
        version: VERSION,
        date,
        triggeredBy: triggerMode,
        taskCount: pendingTasks.length,
        recipient: ROSTAN_EMAIL,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Rostan pending task alert failed", error);
    return new Response(
      JSON.stringify({ error: "Rostan alert could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
