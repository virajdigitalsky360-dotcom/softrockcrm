import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeAllowsRequest, closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";

const VERSION = "5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
};

const KAPIL_EMAIL = "kapilprajapati9054@gmail.com";
const VIRAJ_EMAIL = "viraj.digitalsky360@gmail.com";
const ROSTAN_EMAIL = "softrockind@gmail.com";

const REPORT_RECIPIENTS = [VIRAJ_EMAIL, KAPIL_EMAIL];

interface TeamMemberRow {
  id: string;
  name: string;
  email: string | null;
}

interface GroupedMember {
  name: string;
  email: string;
  memberIds: string[];
}

interface AbsentSubmissionRow {
  team_member_id: string | null;
  reason: string;
  explanation: string | null;
}

function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    crm_down: "CRM was down",
    no_task_assigned: "No task was assigned",
    forgot_to_add_task: "Forgot to add task",
    other: "Other",
  };
  return labels[reason] ?? reason;
}

interface ReportRow {
  member: string;
  email: string;
  taskCount: number;
  status: string;
  markedAbsent: boolean;
  markedPresent: boolean;
  absentReason: string | null;
  absentExplanation: string | null;
}

function buildAttendanceReportHtml(
  date: string,
  results: ReportRow[],
  totals: { present: number; absent: number; excused: number },
): string {
  const rows = results.map((r) => {
    const statusColor = r.status === "absent" ? "#dc2626" : r.status === "excused" ? "#d97706" : "#16a34a";
    const statusText = r.status === "absent" ? "ABSENT" : r.status === "excused" ? "EXCUSED" : "PRESENT";
    const reasonCell = r.absentReason
      ? `<br/><span style="font-size:12px;color:#888;">Reason: ${escapeHtml(reasonLabel(r.absentReason))}${r.absentExplanation ? " — " + escapeHtml(r.absentExplanation) : ""}</span>`
      : "";
    return `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(r.member)}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;">${r.taskCount}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;color:${statusColor};font-weight:bold;">${statusText}${reasonCell}</td>
    </tr>`;
  }).join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1a1a2e;">SOFTROCK Attendance Report — ${escapeHtml(date)}</h2>
    <p>Attendance check completed at 10:40 AM IST.</p>
    <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Employee</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;">Task Count</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;padding:12px;background:#f8f9fa;border-radius:6px;font-size:14px;">
      <strong>Summary:</strong>
      <span style="color:#16a34a;margin-left:12px;">Total Present: ${totals.present}</span>
      <span style="color:#dc2626;margin-left:12px;">Total Absent: ${totals.absent}</span>
      <span style="color:#d97706;margin-left:12px;">Total Excused: ${totals.excused}</span>
    </div>
    <p style="color:#888;font-size:12px;margin-top:20px;">Sent by SOFTROCK CRM attendance system.</p>
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

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
      // Service role key — allow
    } else if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
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
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const date = indiaDate();

    // Sunday check
    const todayDateObj = new Date(date + "T12:00:00+05:30");
    if (todayDateObj.getDay() === 0) {
      return new Response(
        JSON.stringify({ sent: false, reason: "sunday_skip", date, version: VERSION }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Holiday check
    const { data: holidayData } = await supabase
      .from("office_holidays")
      .select("id, holiday_name")
      .eq("holiday_date", date)
      .eq("is_active", true)
      .maybeSingle();
    if (holidayData) {
      return new Response(
        JSON.stringify({ sent: false, reason: "holiday_skip", date, holiday: holidayData, version: VERSION }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch all active team members with an email
    const { data: membersData, error: membersError } = await supabase
      .from("team_members")
      .select("id, name, email")
      .not("email", "is", null)
      .order("name");
    if (membersError) throw membersError;

    const allMembers = (membersData ?? []) as unknown as TeamMemberRow[];

    // Exclude Kapil, Viraj and Rostan (masters/managers)
    const activeMembers = allMembers.filter(
      (m) =>
        m.email &&
        m.email.toLowerCase() !== KAPIL_EMAIL &&
        m.email.toLowerCase() !== VIRAJ_EMAIL &&
        m.email.toLowerCase() !== ROSTAN_EMAIL,
    );

    if (activeMembers.length === 0) {
      return new Response(
        JSON.stringify({ sent: false, reason: "no_active_members", date }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Group members by email
    const memberByEmail = new Map<string, GroupedMember>();
    for (const m of activeMembers) {
      if (!m.email) continue;
      const key = m.email.toLowerCase();
      if (memberByEmail.has(key)) {
        memberByEmail.get(key)!.memberIds.push(m.id);
      } else {
        memberByEmail.set(key, {
          name: m.name,
          email: m.email,
          memberIds: [m.id],
        });
      }
    }

    const groupedMembers = Array.from(memberByEmail.values());

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;

    const { data: dbCronSecret } = await supabase.rpc("get_cron_secret").maybeSingle();
    const cronSecret = dbCronSecret as unknown as string;

    // Fetch absent reason submissions for today
    const { data: submissionsData } = await supabase
      .from("absent_reason_submissions")
      .select("team_member_id, reason, explanation")
      .eq("attendance_date", date);

    const submissions = (submissionsData ?? []) as unknown as AbsentSubmissionRow[];
    const submissionByMemberId = new Map<string, AbsentSubmissionRow>();
    for (const s of submissions) {
      if (s.team_member_id) submissionByMemberId.set(s.team_member_id, s);
    }

    const results: ReportRow[] = [];
    const checkTimestamp = new Date().toISOString();

    for (const member of groupedMembers) {
      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select("id, created_at")
        .in("team_member_id", member.memberIds)
        .eq("due_date", date);
      if (taskError) throw taskError;

      const taskIds = (taskRows ?? []).map((t: { id: string }) => t.id);
      const taskCount = taskIds.length;
      const auditInfo = {
        check_timestamp: checkTimestamp,
        task_count_at_check: taskCount,
        task_ids_at_check: taskIds,
        team_member_ids_checked: member.memberIds,
      };

      const hasTasks = taskCount > 0;

      const { data: existingRecords } = await supabase
        .from("attendance_records")
        .select("id, team_member_id, status, manually_overridden")
        .in("team_member_id", member.memberIds)
        .eq("attendance_date", date);

      const existingRecord = (existingRecords ?? [])[0] ?? null;
      const primaryMemberId = member.memberIds[0];

      // If manually overridden, don't touch it
      if (existingRecord?.manually_overridden) {
        const sub = submissionByMemberId.get(primaryMemberId) ?? null;
        results.push({
          member: member.name,
          email: member.email,
          taskCount: taskCount ?? 0,
          status: existingRecord.status,
          markedAbsent: false,
          markedPresent: false,
          absentReason: sub?.reason ?? null,
          absentExplanation: sub?.explanation ?? null,
        });
        continue;
      }

      if (hasTasks) {
        if (existingRecord) {
          if (existingRecord.status !== "present" && existingRecord.status !== "on_time") {
            await supabase
              .from("attendance_records")
              .update({
                status: "present",
                notes: "Auto-marked present: has task(s) for today",
                manually_overridden: false,
                ...auditInfo,
              })
              .eq("id", existingRecord.id);
          }
        } else {
          await supabase
            .from("attendance_records")
            .insert({
              team_member_id: primaryMemberId,
              attendance_date: date,
              status: "present",
              notes: "Auto-marked present: has task(s) for today",
              manually_overridden: false,
              ...auditInfo,
            });
        }
        results.push({
          member: member.name,
          email: member.email,
          taskCount: taskCount ?? 0,
          status: "present",
          markedAbsent: false,
          markedPresent: true,
          absentReason: null,
          absentExplanation: null,
        });
        continue;
      }

      // No tasks — check for absent reason submission (excused) before marking absent
      const sub = submissionByMemberId.get(primaryMemberId) ?? null;

      // Mark as absent
      let absentRecorded = false;

      if (existingRecord) {
        if (existingRecord.status !== "absent") {
          const { error: updateError } = await supabase
            .from("attendance_records")
            .update({
              status: "absent",
              notes: "Auto-marked absent: no task added by 10:40 AM IST",
              manually_overridden: false,
              ...auditInfo,
            })
            .eq("id", existingRecord.id);
          if (updateError) {
            results.push({
              member: member.name,
              email: member.email,
              taskCount: 0,
              status: "error",
              markedAbsent: false,
              markedPresent: false,
              absentReason: sub?.reason ?? null,
              absentExplanation: sub?.explanation ?? null,
            });
            continue;
          }
        }
        absentRecorded = true;
      } else {
        const { error: insertError } = await supabase
          .from("attendance_records")
          .insert({
            team_member_id: primaryMemberId,
            attendance_date: date,
            status: "absent",
            notes: "Auto-marked absent: no task added by 10:40 AM IST",
            manually_overridden: false,
            ...auditInfo,
          });
        if (insertError) {
          results.push({
            member: member.name,
            email: member.email,
            taskCount: 0,
            status: "error",
            markedAbsent: false,
            markedPresent: false,
            absentReason: sub?.reason ?? null,
            absentExplanation: sub?.explanation ?? null,
          });
          continue;
        }
        absentRecorded = true;
      }

      results.push({
        member: member.name,
        email: member.email,
        taskCount: 0,
        status: "absent",
        markedAbsent: absentRecorded,
        markedPresent: false,
        absentReason: sub?.reason ?? null,
        absentExplanation: sub?.explanation ?? null,
      });
    }

    // Calculate totals
    const presentCount = results.filter((r) => r.status === "present" || r.status === "on_time").length;
    const absentCount = results.filter((r) => r.status === "absent").length;
    const excusedCount = results.filter((r) => r.status === "excused").length;

    // Only send combined report if at least one employee is ABSENT
    if (absentCount > 0) {
      // Dedup: insert into attendance_report_email_log — unique constraint on report_date prevents duplicates
      const { error: dedupError } = await supabase
        .from("attendance_report_email_log")
        .insert({
          report_date: date,
          absent_count: absentCount,
          present_count: presentCount,
          excused_count: excusedCount,
          recipients: REPORT_RECIPIENTS,
          triggered_by: "cron",
        });

      if (dedupError) {
        // Duplicate for today — already sent
        return new Response(
          JSON.stringify({
            sent: false,
            reason: "already_sent_today",
            date,
            version: VERSION,
            summary: {
              totalMembersChecked: groupedMembers.length,
              membersMarkedAbsent: absentCount,
              membersMarkedPresent: presentCount,
              membersExcused: excusedCount,
              reportSent: false,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const totals = { present: presentCount, absent: absentCount, excused: excusedCount };
      const reportHtml = buildAttendanceReportHtml(date, results, totals);
      const reportSubject = `SOFTROCK Attendance Report — ${date} — ${absentCount} Absent`;

      for (const recipientEmail of REPORT_RECIPIENTS) {
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (cronSecret) {
            headers["X-Cron-Secret"] = cronSecret;
          }
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          if (serviceRoleKey) {
            headers["Apikey"] = serviceRoleKey;
            headers["Authorization"] = `Bearer ${serviceRoleKey}`;
          }
          await fetch(sendEmailUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              to: recipientEmail,
              subject: reportSubject,
              html: reportHtml,
              notificationType: "attendance_report",
              triggeredBy: "cron",
            }),
          });
        } catch {
          // best-effort
        }
      }
    }

    return new Response(
      JSON.stringify({
        sent: absentCount > 0,
        version: VERSION,
        date,
        summary: {
          totalMembersChecked: groupedMembers.length,
          membersMarkedAbsent: absentCount,
          membersMarkedPresent: presentCount,
          membersExcused: excusedCount,
          reportSent: absentCount > 0,
        },
        details: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Attendance task check failed", error);
    return new Response(
      JSON.stringify({ error: "Attendance task check could not be completed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
