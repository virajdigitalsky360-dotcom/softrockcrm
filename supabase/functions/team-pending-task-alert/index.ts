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

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
}

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

function buildHtml(memberName: string, tasks: TaskRow[], date: string): string {
  const rows = tasks
    .map(
      (task) => `
    <tr>
      <td>${escapeHtml(task.name)}</td>
      <td>${escapeHtml(task.client?.name ?? "No client")}</td>
      <td>${escapeHtml(task.team_member?.name ?? "Unassigned")}</td>
      <td>${escapeHtml(statusLabel(task.status))}</td>
      <td>${escapeHtml(task.due_date ?? "No due date")}</td>
      <td>${escapeHtml(task.notes ?? "")}</td>
    </tr>`,
    )
    .join("");

  return `
  <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
    <h2 style="color: #1a1a2e;">SOFTROCK — Pending Tasks Report</h2>
    <p>Hello <strong>${escapeHtml(memberName)}</strong>,</p>
    <p>You have <strong>${tasks.length} pending task${tasks.length === 1 ? "" : "s"}</strong> as of ${date} (India time).</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="text-align:left;">Task Name</th>
          <th style="text-align:left;">Client</th>
          <th style="text-align:left;">Assigned Person</th>
          <th style="text-align:left;">Status</th>
          <th style="text-align:left;">Due Date</th>
          <th style="text-align:left;">Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#888; font-size:12px; margin-top:20px;">
      This is an automated email from SOFTROCK CRM. Tasks with status "In Approval" or "Approved" are not included.
    </p>
  </div>`;
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

    const VIRAJ_EMAIL = "viraj.digitalsky360@gmail.com";

    // Fetch all active team members with an email, excluding Kapil, Rostan, and Viraj
    // Viraj is the Primary Master — excluded from pending task emails and monitoring
    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("id, name, email")
      .not("email", "is", null)
      .neq("name", "Kapil")
      .neq("name", "kapil")
      .neq("name", "Rostan")
      .neq("name", "rostan")
      .order("name");
    if (membersError) throw membersError;

    const allMembers = (members ?? []) as unknown as TeamMember[];
    const activeMembers = allMembers.filter(
      (m) => m.email && m.email.toLowerCase() !== VIRAJ_EMAIL,
    );
    if (activeMembers.length === 0) {
      return new Response(
        JSON.stringify({ sent: false, reason: "no_team_members", date }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;

    // Read CRON_SECRET from the database so we can authenticate to send-email
    const { data: dbCronSecret } = await supabase.rpc("get_cron_secret").maybeSingle();
    const cronSecret = dbCronSecret as unknown as string;

    const results: Array<{
      member: string;
      email: string;
      taskCount: number;
      status: string;
      error?: string;
    }> = [];

    for (const member of activeMembers) {
      if (!member.email) continue;

      // Cron mode: dedup — one alert per member per India day
      if (!isManual) {
        const { error: claimError } = await supabase
          .from("team_task_alerts")
          .insert({ alert_date: date, team_member_id: member.id, task_count: 0 });
        if (claimError) {
          // Already sent for this member today — skip
          results.push({
            member: member.name,
            email: member.email,
            taskCount: 0,
            status: "skipped",
          });
          continue;
        }
      }

      // Fetch this member's pending tasks due today only
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select(
          "name, status, due_date, notes, client:clients(name), team_member:team_members(name)",
        )
        .eq("team_member_id", member.id)
        .eq("due_date", date)
        .in("status", PENDING_STATUSES)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (taskError) throw taskError;

      const pendingTasks = (taskData ?? []) as unknown as TaskRow[];

      if (pendingTasks.length === 0) {
        // No pending tasks — don't send, just update dedup counter
        if (!isManual) {
          await supabase
            .from("team_task_alerts")
            .update({ task_count: 0 })
            .eq("alert_date", date)
            .eq("team_member_id", member.id);
        }
        results.push({
          member: member.name,
          email: member.email,
          taskCount: 0,
          status: "skipped",
        });
        continue;
      }

      // Build the email
      const subject = `SOFTROCK — Pending Tasks Report — ${member.name}`;
      const htmlBody = buildHtml(member.name, pendingTasks, date);

      // Send via centralized email function (uses single RESEND_API_KEY)
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
            to: member.email,
            subject,
            html: htmlBody,
            notificationType: "pending_tasks",
            teamMemberId: member.id,
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

      // Log the attempt to legacy table (kept for backward compat)
      await supabase.from("team_email_logs").insert({
        team_member_id: member.id,
        team_member_name: member.name,
        recipient_email: member.email,
        task_count: pendingTasks.length,
        task_details: taskDetailsJson(pendingTasks),
        status: emailStatus,
        error_message: emailError,
        triggered_by: triggerMode,
      });

      // Update dedup counter
      if (!isManual) {
        await supabase
          .from("team_task_alerts")
          .update({ task_count: pendingTasks.length })
          .eq("alert_date", date)
          .eq("team_member_id", member.id);
      }

      results.push({
        member: member.name,
        email: member.email,
        taskCount: pendingTasks.length,
        status: emailStatus,
        error: emailError ?? undefined,
      });
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    return new Response(
      JSON.stringify({
        sent: sentCount > 0,
        version: VERSION,
        date,
        triggeredBy: triggerMode,
        summary: {
          totalMembers: activeMembers.length,
          emailsSent: sentCount,
          emailsFailed: failedCount,
          skipped: skippedCount,
        },
        details: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Team pending task alert failed", error);
    return new Response(
      JSON.stringify({ error: "Team alert could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
