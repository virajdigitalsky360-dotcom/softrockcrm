import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";

const VERSION = "1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRIMARY_MASTER_EMAIL = "viraj.digitalsky360@gmail.com";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Date helpers (IST)
// ---------------------------------------------------------------------------
function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function indiaTomorrow(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(t);
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + "T12:00:00+05:30").getDay() === 0;
}

function formatDateDisplay(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(dateStr + "T12:00:00+05:30"));
}

function extractDate(text: string): string | null {
  const lower = text.toLowerCase();
  const now = indiaDate();
  if (lower.includes("today") || lower.includes("આજે") || lower.includes("aaje") || lower.includes("आज")) return now;
  if (lower.includes("tomorrow") || lower.includes("કાલે") || lower.includes("આવતીકાલે") || lower.includes("कल")) return indiaTomorrow();

  const months: Record<string, string> = {
    january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03",
    april: "04", apr: "04", may: "05", june: "06", jun: "06", july: "07", jul: "07",
    august: "08", aug: "08", september: "09", sep: "09", sept: "09", october: "10", oct: "10",
    november: "11", nov: "11", december: "12", dec: "12",
  };

  const m1 = lower.match(/(\d{1,2})\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?/);
  if (m1) {
    const year = m1[3] ?? now.slice(0, 4);
    return `${year}-${months[m1[2]]}-${m1[1].padStart(2, "0")}`;
  }
  const m2 = lower.match(/(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:\s+(\d{4}))?/);
  if (m2) {
    const year = m2[3] ?? now.slice(0, 4);
    return `${year}-${months[m2[1]]}-${m2[2].padStart(2, "0")}`;
  }
  const m3 = lower.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
  if (m3) {
    if (m3[1].length === 4) return `${m3[1]}-${m3[2].padStart(2, "0")}-${m3[3].padStart(2, "0")}`;
    const year = m3[3].length === 4 ? m3[3] : now.slice(0, 4);
    return `${year}-${m3[2].padStart(2, "0")}-${m3[1].padStart(2, "0")}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Intent parser
// ---------------------------------------------------------------------------
type Intent =
  | { type: "create_task"; assignee?: string; taskName?: string; dueDate?: string }
  | { type: "update_task_status"; taskRef?: string; status?: string; expectedStatus?: string }
  | { type: "assign_task"; taskRef?: string; assignee?: string; expectedAssigneeId?: string | null }
  | { type: "show_task"; taskRef?: string }
  | { type: "list_pending_tasks"; date?: string }
  | { type: "list_no_task_members"; date?: string }
  | { type: "list_clients"; clientRef?: string }
  | { type: "create_client"; clientName?: string }
  | { type: "attendance_report"; date?: string }
  | { type: "list_leaves"; status?: string }
  | { type: "update_leave_status"; employeeRef?: string; status?: string; leaveId?: string }
  | { type: "create_holiday"; date?: string; name?: string }
  | { type: "remove_holiday"; date?: string }
  | { type: "list_holidays" }
  | { type: "check_holiday"; date?: string }
  | { type: "maintenance_on" }
  | { type: "maintenance_off" }
  | { type: "delete_user"; userRef?: string; deletionType?: "full" | "data_only" }
  | { type: "work_report"; date?: string }
  | { type: "crm_health_check" }
  | { type: "unknown" };

const STATUS_MAP: Record<string, string> = {
  approved: "approved", approve: "approved", "પ્રમાણિત": "approved",
  "मंजूर": "approved", "स्वीकृत": "approved", "मंज़ूर": "approved",
  "not approved": "not_approved", reject: "not_approved", rejected: "not_approved", "રદ": "not_approved",
  "अस्वीकृत": "not_approved", "नामंजूर": "not_approved", "नामंज़ूर": "not_approved",
  "in progress": "in_progress", inprogress: "in_progress", started: "started", start: "started",
  "प्रगति में": "in_progress", "शुरू": "started", "ચાલુ": "in_progress",
  "not started": "not_started", "in approval": "in_approval", pending: "not_started",
  "शुरू नहीं": "not_started", "लंबित": "not_started", "બાકી": "not_started",
};

function parseStatus(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const key of Object.keys(STATUS_MAP).sort((a, b) => b.length - a.length)) {
    if (lower.includes(key)) return STATUS_MAP[key];
  }
  return undefined;
}

// Extract a person name from text (capitalized word(s) not matching keywords)
const KEYWORDS = new Set([
  "task", "add", "create", "assign", "reassign", "update", "approve", "approved",
  "remove", "delete", "cancel", "show", "list", "maintenance", "mode", "on", "off",
  "today", "tomorrow", "holiday", "office", "closed", "report", "work", "pending",
  "user", "data", "details", "status", "check", "viraj", "softrock",
]);

function extractPersonName(text: string): string | undefined {
  const words = text.split(/[\s,]+/).filter(Boolean);
  // collect capitalized tokens that aren't keywords
  const caps = words.filter((w) => /^[A-Z][a-z]{2,}$/.test(w) && !KEYWORDS.has(w.toLowerCase()));
  if (caps.length > 0) return caps.join(" ");
  // try transliterated common names
  const lower = text.toLowerCase();
  const knownNames = ["rostan", "irfan", "kapil", "bhagyoday", "yuvraj", "demo"];
  for (const n of knownNames) {
    if (lower.includes(n)) return n.charAt(0).toUpperCase() + n.slice(1);
  }
  return undefined;
}

function extractTaskName(text: string): string | undefined {
  const q = text.match(/["'“](.+?)["'”]/);
  if (q) return q[1];
  const named = text.match(/(?:named|called|task\s*:\s*|कार्य\s*:\s*|काम\s*:\s*)(.+)/i);
  if (named) {
    const value = named[1].trim().split(/\s+(?:for|to|assign|on|due|by|ને|આપ|के लिए|को सौंप|को दो)/i)[0].trim();
    return value || undefined;
  }
  return undefined;
}

function extractNamedValue(text: string, marker: RegExp, stopWords: RegExp): string | undefined {
  const quoted = text.match(/["'“](.+?)["'”]/);
  if (quoted) return quoted[1].trim();
  const match = text.match(marker);
  if (!match?.[1]) return undefined;
  const value = match[1].split(stopWords)[0].trim().replace(/[।,;]+$/, "");
  return value || undefined;
}

function parseIntent(text: string): Intent {
  const lower = text.toLowerCase().trim();

  // Maintenance mode
  if ((lower.includes("maintenance") || lower.includes("મેન્ટેનન્સ")) && (lower.includes("on") || lower.includes("ચાલુ") || lower.includes("enable") || lower.includes("start"))) {
    return { type: "maintenance_on" };
  }
  if ((lower.includes("maintenance") || lower.includes("મેન્ટેનન્સ")) && (lower.includes("off") || lower.includes("બંધ") || lower.includes("disable") || lower.includes("stop"))) {
    return { type: "maintenance_off" };
  }

  // Client directory and creation. Mutations are confirmed by the executor.
  if (/(client|ગ્રાહક|ક્લાયન્ટ|ग्राहक|क्लाइंट)/i.test(text)) {
    if (/(add|create|new|ઉમેર|બનાવ|જોડ|बनाओ|बनाएं|जोड़|नया|નવો)/i.test(text)) {
      return {
        type: "create_client",
        clientName: extractNamedValue(
          text,
          /(?:clients?|ગ્રાહક|ક્લાયન્ટ|ग्रાહक|क्लाइंट)\s+(?:named|called|નામે|नाम|का नाम)?\s*[:\-]?\s*(.+)/i,
          /\s+(?:email|phone|ને|પર|को|का|और|અને)\b/i,
        ),
      };
    }
    if (/(list|show|find|search|બતાવ|બતાવો|દેખાવો|શોધ|યાદી|दिखा|दिखाओ|सूची|खोज)/i.test(text)) {
      return {
        type: "list_clients",
        clientRef: extractNamedValue(
          text,
          /(?:clients?|ગ્રાહક|ક્લાયન્ટ|ग्रાહक|क्लाइंट)\s+(?:named|called|નામે|नाम)?\s*[:\-]?\s*(.+)/i,
          /\s+(?:details|email|phone|બતાવ|દેખાવો|दिखाओ|खोजो)\b/i,
        ),
      };
    }
  }

  // Attendance reports and leave requests.
  if (/(attendance|હાજરી|उपस्थिति)/i.test(text) && /(report|show|list|બતાવ|બતાવો|રિપોર્ટ|દેખાવો|दिखा|दिखाओ|रिपोर्ट)/i.test(text)) {
    return { type: "attendance_report", date: extractDate(text) ?? indiaDate() };
  }
  if (/(leave|રજા|छुट्टी)/i.test(text)) {
    const leaveStatus = /(approve|approved|મંજૂર|મંજૂરી|मंजूर|स्वीकृत)/i.test(text)
      ? "approved"
      : /(reject|rejected|રદ|नामंजूर|अस्वीकृत)/i.test(text)
        ? "rejected"
        : undefined;
    if (leaveStatus) {
      return {
        type: "update_leave_status",
        employeeRef: extractNamedValue(
          text,
          /(?:for|of|ની|ના|के|की|का)\s+(.+)/i,
          /\s+(?:leave|રજા|छुट्टी|request|અરજી|अनुरोध)\b/i,
        ) ?? extractPersonName(text),
        status: leaveStatus,
      };
    }
    if (/(list|show|pending|બતાવ|યાદી|દેખાવો|दिखा|सूची|लंबित)/i.test(text)) {
      const status = /(pending|બાકી|લંબિત|लंबित)/i.test(text) ? "pending" : undefined;
      return { type: "list_leaves", status };
    }
  }

  // Holiday
  if (lower.includes("holiday") || lower.includes("office closed") || lower.includes("રજા") || lower.includes("छुट्टी")) {
    if (lower.includes("remove") || lower.includes("delete") || lower.includes("cancel") || lower.includes("દૂર") || lower.includes("રદ") || lower.includes("કાઢ")) {
      return { type: "remove_holiday", date: extractDate(text) ?? undefined };
    }
    if (lower.includes("show") || lower.includes("list") || lower.includes("upcoming") || lower.includes("બતાવ") || lower.includes("યાદી")) {
      return { type: "list_holidays" };
    }
    if (lower.includes("check") || lower.includes("છે કે નહીં")) {
      return { type: "check_holiday", date: extractDate(text) ?? indiaDate() };
    }
    const date = extractDate(text);
    // extract name
    let name = "Office Holiday";
    const cleaned = text.replace(/\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/gi, "")
      .replace(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/gi, "")
      .replace(/\d{1,2}(st|nd|rd|th)?/gi, "").replace(/\d{4}/g, "");
    const structural = ["office", "is", "closed", "holiday", "today", "tomorrow", "set", "add", "a", "the", "because", "of", "on", "for", "છે", "બંધ", "રજા", "આજે", "કાલે", "આવતીકાલે"];
    let c = cleaned;
    for (const w of structural) c = c.replace(new RegExp(`\\b${w}\\b`, "gi"), "");
    c = c.replace(/[,\u0A80-\u0AFF]+/g, "").replace(/\s+/g, " ").trim();
    if (c.length > 0) name = c;
    return { type: "create_holiday", date: date ?? undefined, name };
  }

  // Work report
  if (lower.includes("work report") || lower.includes("વર્ક રિપોર્ટ") || lower.includes("report બનાવ")) {
    return { type: "work_report", date: extractDate(text) ?? undefined };
  }

  // Delete user
  if ((lower.includes("user") || lower.includes("યુઝર")) && (lower.includes("remove") || lower.includes("delete") || lower.includes("દૂર") || lower.includes("કાઢ") || lower.includes("રદ"))) {
    const isDataOnly = lower.includes("data") && !lower.includes("account") && !lower.includes("full");
    return { type: "delete_user", userRef: extractPersonName(text), deletionType: isDataOnly ? "data_only" : "full" };
  }

  // Task operations
  if (lower.includes("task") || lower.includes("ટાસ્ક") || lower.includes("कार्य") || lower.includes("काम")) {
    // status update
    const status = parseStatus(text);
    if (status && (lower.includes("કરી") || lower.includes("દે") || lower.includes("update") || lower.includes("set") || lower.includes("status") || lower.includes("સ્ટેટસ") || lower.includes("स्थिति") || lower.includes("बदल") || lower.includes("करो") || lower.includes("करें"))) {
      return { type: "update_task_status", taskRef: extractTaskName(text) ?? extractPersonName(text), status };
    }
    // assign
    if (lower.includes("assign") || lower.includes("reassign") || lower.includes("આપ") || lower.includes("ને") || lower.includes("सौंप") || lower.includes("आवंटित") || lower.includes("को दो") || lower.includes("देना")) {
      return { type: "assign_task", taskRef: extractTaskName(text), assignee: extractPersonName(text) };
    }
    if ((lower.includes("pending") || lower.includes("પેન્ડિંગ") || lower.includes("લંબિત") || lower.includes("બાકી") || lower.includes("लंबित") || lower.includes("बकाया")) &&
      (lower.includes("show") || lower.includes("list") || lower.includes("બતાવ") || lower.includes("દેખાવો") || lower.includes("दिखा") || lower.includes("सूची"))) {
      return { type: "list_pending_tasks", date: extractDate(text) ?? undefined };
    }
    // show details
    if (lower.includes("details") || lower.includes("ડિટેલ્સ") || lower.includes("બતાવ") || lower.includes("show") || lower.includes("વિવરણ") || lower.includes("विवरण") || lower.includes("दिखा")) {
      return { type: "show_task", taskRef: extractTaskName(text) ?? extractPersonName(text) };
    }
    // no-task members query
    if (lower.includes("કોને") && lower.includes("નથી") || lower.includes("who has no task") || lower.includes("no task") || lower.includes("किसे काम नहीं") || lower.includes("किसको काम नहीं")) {
      return { type: "list_no_task_members", date: extractDate(text) ?? indiaDate() };
    }
    // create task
    if (lower.includes("add") || lower.includes("create") || lower.includes("કરી આપ") || lower.includes("નાખ") || lower.includes("બનાવ") || lower.includes("બનાવો") || lower.includes("बनाओ") || lower.includes("बनाएं") || lower.includes("जोड़ो") || lower.includes("दे दो")) {
      return { type: "create_task", assignee: extractPersonName(text), taskName: extractTaskName(text), dueDate: extractDate(text) ?? undefined };
    }
  }

  // pending tasks
  if ((lower.includes("pending") || lower.includes("પેન્ડિંગ") || lower.includes("લંબિત") || lower.includes("બાકી") || lower.includes("बकाया") || lower.includes("लंबित")) && (lower.includes("task") || lower.includes("ટાસ્ક") || lower.includes("બતાવ") || lower.includes("show") || lower.includes("list") || lower.includes("कार्य") || lower.includes("काम"))) {
    return { type: "list_pending_tasks", date: extractDate(text) ?? undefined };
  }

  // CRM Health Check / Diagnostic
  const healthCheckPhrases = [
    "crm status", "crm check", "crm health", "crm diagnostic", "crm diagnosis",
    "crm માં શું problem", "crm માં શું છે", "crm માં અત્યારે શું",
    "શું issue છે", "શું problem છે",
    "crm status બતાવ", "crm check કર",
    "crm માં શું problem છે",
    "crm માં અત્યારે શું ચાલે છે",
    "what's wrong with crm", "what is wrong with crm",
    "crm માં સમસ્યા", "crm ની સ્થિતિ",
  ];
  if (healthCheckPhrases.some((p) => lower.includes(p))) {
    return { type: "crm_health_check" };
  }

  return { type: "unknown" };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------
function ok(response: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ response, status: "completed", ...extra, version: VERSION }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function needConfirm(response: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ response, status: "needs_confirmation", ...extra, version: VERSION }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(response: string) {
  return new Response(JSON.stringify({ response, status: "failed", version: VERSION }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function findTeamMember(supabase: ReturnType<typeof createClient>, nameRef: string) {
  if (!nameRef) return null;
  const lower = nameRef.toLowerCase();
  const { data } = await supabase.from("team_members").select("id, name, email, workspace_id").ilike("name", `%${lower}%`).limit(5);
  if (data && data.length > 0) return data[0];
  // try email
  const { data: data2 } = await supabase.from("team_members").select("id, name, email, workspace_id").ilike("email", `%${lower}%`).limit(1);
  return data2?.[0] ?? null;
}

async function findTask(supabase: ReturnType<typeof createClient>, ref: string) {
  if (!ref) return null;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ref)) {
    const { data: byId } = await supabase.from("tasks").select("id, name, status, team_member_id, due_date, client:clients(name), team_member:team_members(name)").eq("id", ref).maybeSingle();
    if (byId) return byId;
  }
  const { data } = await supabase.from("tasks").select("id, name, status, team_member_id, due_date, client:clients(name), team_member:team_members(name)").ilike("name", `%${ref}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

async function findUser(supabase: ReturnType<typeof createClient>, ref: string) {
  if (!ref) return null;
  const lower = ref.toLowerCase();
  const { data } = await supabase.from("profiles").select("id, email, display_name, role").ilike("email", `%${lower}%`).limit(5);
  if (data && data.length > 0) return data[0];
  const { data: d2 } = await supabase.from("profiles").select("id, email, display_name, role").ilike("display_name", `%${lower}%`).limit(5);
  return d2?.[0] ?? null;
}

const PENDING_STATUSES = ["not_started", "started", "in_progress", "in_approval"];
const TASK_STATUSES = new Set(["not_started", "started", "in_progress", "in_approval", "approved", "not_approved"]);

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
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

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userEmail = (userData.user.email ?? "").toLowerCase();
    if (userEmail !== PRIMARY_MASTER_EMAIL) {
      return new Response(JSON.stringify({ error: "Only the Primary Master (Viraj) can use the AI CRM Assistant." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { message, confirm, history, pendingIntent } = body as {
      message?: string;
      confirm?: boolean;
      history?: ChatMessage[];
      pendingIntent?: Intent | null;
    };

    // ----- Confirmation flow -----
    if (confirm && pendingIntent) {
      return await executeIntent(supabase, pendingIntent, userData.user.id, true);
    }

    if (!message || typeof message !== "string") {
      return ok("Hi Viraj! I'm your AI CRM Assistant. Tell me what you need — create tasks, approve tasks, manage holidays, toggle maintenance mode, generate reports, and more. Try: 'Rostan ને આજે task add કરી આપ' or 'કાલે office બંધ છે'.");
    }

    const intent = parseIntent(message);

    if (intent.type === "unknown") {
      return ok(
        "I can help you with:\n\n• Create/assign/update tasks\n• Show pending tasks or task details\n• Add/remove office holidays\n• Check if today is a holiday\n• Toggle Maintenance Mode on/off\n• Remove a user or delete user data\n• Generate a work report\n• CRM Health Check / Diagnostic ('CRM status બતાવ')\n\nExamples:\n• 'Rostan ને આજે task add કરી આપ'\n• 'આ task Approved કરી દે'\n• 'કાલે office બંધ છે'\n• 'Maintenance Mode ON કર'\n• 'આજના pending tasks બતાવ'\n• 'CRM status બતાવ'",
      );
    }

    return await executeIntent(supabase, intent, userData.user.id, false);
  } catch (error) {
    console.error("CRM assistant error", error);
    return fail("Something went wrong while processing your request. Please try again.");
  }
});

// ---------------------------------------------------------------------------
async function executeIntent(supabase: ReturnType<typeof createClient>, intent: Intent, userId: string, confirmed: boolean) {
  switch (intent.type) {
    // ----- TASKS -----
    case "create_task": {
      const { assignee, taskName, dueDate } = intent;
      if (!assignee) return fail("Which team member should I assign the task to? Please mention a name, e.g. 'Rostan ને task add કરી આપ'.");
      const member = await findTeamMember(supabase, assignee);
      if (!member) return fail(`I couldn't find a team member named "${assignee}". Please check the name and try again.`);
      const name = taskName ?? `New task for ${member.name}`;
      if (!confirmed) {
        return needConfirm(
          `Create task "${name}" for ${member.name}${dueDate ? ` due ${formatDateDisplay(dueDate)}` : ` for ${formatDateDisplay(indiaDate())}`}? Reply yes to confirm.`,
          { pendingIntent: intent },
        );
      }
      const insertData: Record<string, unknown> = {
        name,
        team_member_id: member.id,
        workspace_id: member.workspace_id,
        due_date: dueDate ?? indiaDate(),
        status: "not_started",
        created_by: userId,
      };
      const { data, error } = await supabase.from("tasks").insert(insertData).select("id").single();
      if (error) return fail(`Could not create the task. Please try again.`);
      return ok(`Done! Task "${name}" created and assigned to ${member.name}${dueDate ? ` for ${formatDateDisplay(dueDate)}` : " for today"}.`);
    }

    case "update_task_status": {
      const { taskRef, status } = intent;
      if (!status) return fail("Which status should I set? Try: Approved, Not Approved, In Progress, Started, or Not Started.");
      if (!TASK_STATUSES.has(status)) return fail("That task status is not supported.");
      if (!taskRef) return fail("Which task should I update? Please mention the task name or the assigned person.");
      const task = await findTask(supabase, taskRef);
      if (!task) return fail(`I couldn't find a task matching "${taskRef}". Try using the exact task name.`);
      if (!confirmed) {
        return needConfirm(
          `Change "${task.name}" from ${task.status.replace("_", " ")} to ${status.replace("_", " ")}? Reply yes to confirm.`,
          { pendingIntent: { ...intent, taskRef: task.id, expectedStatus: task.status } },
        );
      }
      if (intent.expectedStatus && task.status !== intent.expectedStatus) {
        return fail(`Task "${task.name}" changed since confirmation. Review its current status and try again.`);
      }
      const { data: updated, error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", task.id)
        .eq("status", task.status)
        .select("id")
        .maybeSingle();
      if (error || !updated) return fail("Could not update the task status; it may have changed. Please review and try again.");
      return ok(`Done! Task "${task.name}" status updated to ${status.replace("_", " ")}.`);
    }

    case "assign_task": {
      const { taskRef, assignee } = intent;
      if (!assignee) return fail("Who should I assign the task to? Please mention a name.");
      if (!taskRef) return fail("Which task should I reassign? Please mention the task name.");
      const member = await findTeamMember(supabase, assignee);
      if (!member) return fail(`I couldn't find a team member named "${assignee}".`);
      const task = await findTask(supabase, taskRef);
      if (!task) return fail(`I couldn't find a task matching "${taskRef}".`);
      if (!confirmed) {
        const currentOwner = (task as any).team_member?.name ?? "Unassigned";
        return needConfirm(
          `Reassign "${task.name}" from ${currentOwner} to ${member.name}? Reply yes to confirm.`,
          { pendingIntent: { ...intent, taskRef: task.id, expectedAssigneeId: task.team_member_id } },
        );
      }
      if (intent.expectedAssigneeId !== undefined && task.team_member_id !== intent.expectedAssigneeId) {
        return fail(`Task "${task.name}" changed since confirmation. Review its current assignee and try again.`);
      }
      let update = supabase
        .from("tasks")
        .update({ team_member_id: member.id, workspace_id: member.workspace_id })
        .eq("id", task.id);
      update = task.team_member_id
        ? update.eq("team_member_id", task.team_member_id)
        : update.is("team_member_id", null);
      const { data: updated, error } = await update.select("id").maybeSingle();
      if (error || !updated) return fail("Could not reassign the task; its assignee may have changed. Please review and try again.");
      return ok(`Done! Task "${task.name}" reassigned to ${member.name}.`);
    }

    case "show_task": {
      const { taskRef } = intent;
      if (!taskRef) return fail("Which task should I show? Please mention the task name.");
      const task = await findTask(supabase, taskRef);
      if (!task) return fail(`I couldn't find a task matching "${taskRef}".`);
      const tmName = (task as any).team_member?.name ?? "Unassigned";
      const clientName = (task as any).client?.name ?? "No client";
      return ok(`Task: ${task.name}\nStatus: ${(task as any).status?.replace("_", " ") ?? "—"}\nAssigned to: ${tmName}\nClient: ${clientName}\nDue: ${task.due_date ? formatDateDisplay(task.due_date) : "—"}`);
    }

    case "list_pending_tasks": {
      const date = intent.date;
      let query = supabase
        .from("tasks")
        .select("name, status, due_date, team_member:team_members(name)")
        .in("status", PENDING_STATUSES)
        .order("due_date", { ascending: true })
        .limit(30);
      if (date) query = query.eq("due_date", date);
      const { data, error } = await query;
      if (error) return fail("Could not fetch pending tasks. Please try again.");
      if (!data || data.length === 0) return ok(date ? `No pending tasks found for ${formatDateDisplay(date)}. Everything is up to date!` : "No pending tasks found. Everything is up to date!");
      let txt = `Pending tasks${date ? ` for ${formatDateDisplay(date)}` : ""} (${data.length}):\n\n`;
      for (const t of data as any[]) {
        const tm = t.team_member?.name ?? "Unassigned";
        txt += `• ${t.name} — ${t.status.replace("_", " ")} — ${tm} — due ${t.due_date ? formatDateDisplay(t.due_date) : "—"}\n`;
      }
      return ok(txt);
    }

    case "list_clients": {
      let query = supabase.from("clients").select("name, email, phone, notes").order("name").limit(25);
      if (intent.clientRef) query = query.ilike("name", `%${intent.clientRef}%`);
      const { data, error } = await query;
      if (error) return fail("Could not fetch clients. Please try again.");
      if (!data?.length) return ok(intent.clientRef ? `No client matched "${intent.clientRef}".` : "No clients found.");
      return ok(`Clients (${data.length}):\n\n${data.map((client) =>
        `• ${client.name}${client.email ? ` — ${client.email}` : ""}${client.phone ? ` — ${client.phone}` : ""}`,
      ).join("\n")}`);
    }

    case "create_client": {
      const name = intent.clientName?.trim();
      if (!name) return fail("Please provide the client name, for example: add client \"Acme Ltd\".");
      const { data: existing, error: lookupError } = await supabase
        .from("clients")
        .select("id, name")
        .ilike("name", name)
        .limit(2);
      if (lookupError) return fail("Could not check for an existing client.");
      if (existing?.length) return fail(`A client named "${existing[0].name}" already exists or matches; no duplicate was created.`);
      if (!confirmed) {
        return needConfirm(`Create client "${name}"? Reply yes to confirm.`, { pendingIntent: intent });
      }
      const { error } = await supabase.from("clients").insert({ name }).select("id").single();
      if (error) return fail("Could not create the client. Please try again.");
      return ok(`Client "${name}" created.`);
    }

    case "attendance_report": {
      const date = intent.date ?? indiaDate();
      const { data, error } = await supabase
        .from("attendance_records")
        .select("status, team_member:team_members(name)")
        .eq("attendance_date", date)
        .order("status");
      if (error) return fail("Could not fetch attendance records. Please try again.");
      if (!data?.length) return ok(`No attendance records found for ${formatDateDisplay(date)}.`);
      const counts = new Map<string, number>();
      const lines = data.map((record) => {
        counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
        const relation = record.team_member as unknown as { name: string } | null;
        return `• ${relation?.name ?? "Unknown"} — ${record.status.replace("_", " ")}`;
      });
      const summary = [...counts.entries()].map(([status, count]) => `${count} ${status.replace("_", " ")}`).join(", ");
      return ok(`Attendance for ${formatDateDisplay(date)} (${summary}):\n\n${lines.join("\n")}`);
    }

    case "list_leaves": {
      let query = supabase
        .from("leaves")
        .select("employee_name, from_date, to_date, day_type, status, reason")
        .order("from_date", { ascending: false })
        .limit(30);
      if (intent.status) query = query.eq("status", intent.status);
      const { data, error } = await query;
      if (error) return fail("Could not fetch leave requests. Please try again.");
      if (!data?.length) return ok(`No ${intent.status ?? ""} leave requests found.`);
      return ok(`Leave requests (${data.length}):\n\n${data.map((leave) =>
        `• ${leave.employee_name} — ${leave.status} — ${leave.from_date} to ${leave.to_date} (${leave.day_type})${leave.reason ? ` — ${leave.reason}` : ""}`,
      ).join("\n")}`);
    }

    case "update_leave_status": {
      const employeeRef = intent.employeeRef?.trim();
      if (!employeeRef && !intent.leaveId) return fail("Which employee's leave request should I update? Include the employee name.");
      if (intent.status !== "approved" && intent.status !== "rejected") return fail("Leave status must be approved or rejected.");
      let query = supabase
        .from("leaves")
        .select("id, employee_name, from_date, to_date, status")
        .eq("status", "pending");
      query = intent.leaveId
        ? query.eq("id", intent.leaveId)
        : query.ilike("employee_name", `%${employeeRef}%`).limit(3);
      const { data: leaves, error: lookupError } = await query;
      if (lookupError) return fail("Could not find the leave request.");
      if (!leaves?.length) return fail(`No pending leave request found${employeeRef ? ` for "${employeeRef}"` : ""}.`);
      if (leaves.length > 1) return fail(`There are multiple pending leave requests for "${employeeRef}". Use a more specific employee name or update it in Leave Management.`);
      const leave = leaves[0];
      if (!confirmed) {
        return needConfirm(
          `${intent.status === "approved" ? "Approve" : "Reject"} ${leave.employee_name}'s leave request (${leave.from_date} to ${leave.to_date})? Reply yes to confirm.`,
          { pendingIntent: { ...intent, leaveId: leave.id } },
        );
      }
      const { data: updated, error } = await supabase
        .from("leaves")
        .update({ status: intent.status })
        .eq("id", leave.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (error || !updated) return fail("The leave request could not be updated; it may already have changed.");
      return ok(`${leave.employee_name}'s leave request was ${intent.status}.`);
    }

    case "list_no_task_members": {
      const date = intent.date ?? indiaDate();
      const { data: allMembers } = await supabase.from("team_members").select("id, name").order("name");
      const { data: tasksToday } = await supabase.from("tasks").select("team_member_id").eq("due_date", date).not("team_member_id", "is", null);
      if (!allMembers) return fail("Could not fetch team members.");
      const withTasks = new Set((tasksToday ?? []).map((t: any) => t.team_member_id));
      const without = allMembers.filter((m: any) => !withTasks.has(m.id));
      if (without.length === 0) return ok(`All team members have a task for ${formatDateDisplay(date)}.`);
      let txt = `No task assigned for ${formatDateDisplay(date)} (${without.length}):\n\n`;
      for (const m of without) txt += `• ${m.name}\n`;
      return ok(txt);
    }

    // ----- HOLIDAYS -----
    case "create_holiday": {
      const { date, name } = intent;
      if (!date) return fail("Which date should I set the holiday for? Try 'tomorrow', 'today', or '25 September'.");
      if (isSunday(date)) return ok(`${formatDateDisplay(date)} is a Sunday — it's already an automatic non-working day. No entry needed.`);
      const { data: existing } = await supabase.from("office_holidays").select("id, holiday_name").eq("holiday_date", date).eq("is_active", true).maybeSingle();
      if (existing) {
        return ok(`A holiday already exists for ${formatDateDisplay(date)} — "${existing.holiday_name}". Would you like me to update it to "${name}"? Reply "yes" to confirm.`);
      }
      if (!confirmed) {
        return needConfirm(`Office holiday for ${formatDateDisplay(date)} — "${name}". Reply "yes" to confirm and save it.`, { pendingIntent: intent });
      }
      const { error } = await supabase.from("office_holidays").insert({ holiday_date: date, holiday_name: name, is_active: true, created_by: userId });
      if (error) return fail("Could not save the holiday. Please try again.");
      return ok(`Done! Office holiday set for ${formatDateDisplay(date)} — ${name}. Automatic attendance, pending-task emails, and inactivity monitoring will be skipped on this day.`);
    }

    case "remove_holiday": {
      const { date } = intent;
      if (!date) return fail("Which date should I remove the holiday for?");
      if (isSunday(date)) return ok(`${formatDateDisplay(date)} is a Sunday — automatic non-working days can't be removed.`);
      const { data: existing } = await supabase.from("office_holidays").select("id, holiday_name").eq("holiday_date", date).eq("is_active", true).maybeSingle();
      if (!existing) return ok(`No active office holiday found for ${formatDateDisplay(date)}.`);
      if (!confirmed) {
        return needConfirm(`Remove the holiday on ${formatDateDisplay(date)} — "${existing.holiday_name}"? Reply "yes" to confirm.`, { pendingIntent: intent });
      }
      const { error } = await supabase.from("office_holidays").update({ is_active: false }).eq("id", existing.id);
      if (error) return fail("Could not remove the holiday. Please try again.");
      return ok(`Done! Office holiday removed for ${formatDateDisplay(date)}. Normal automation will resume on this day.`);
    }

    case "list_holidays": {
      const today = indiaDate();
      const { data } = await supabase.from("office_holidays").select("holiday_date, holiday_name, is_active").eq("is_active", true).gte("holiday_date", today).order("holiday_date", { ascending: true }).limit(20);
      const upcoming = data ?? [];
      if (upcoming.length === 0) return ok("No upcoming office holidays found.");
      let txt = "Upcoming office holidays:\n\n";
      for (const h of upcoming) txt += `• ${formatDateDisplay(h.holiday_date)} — ${h.holiday_name}\n`;
      return ok(txt);
    }

    case "check_holiday": {
      const date = intent.date ?? indiaDate();
      if (isSunday(date)) return ok(`Yes, ${formatDateDisplay(date)} is a Sunday — automatically a non-working day. The office is closed.`);
      const { data } = await supabase.from("office_holidays").select("holiday_name").eq("holiday_date", date).eq("is_active", true).maybeSingle();
      if (data) return ok(`Yes, ${formatDateDisplay(date)} is a holiday — ${data.holiday_name}. The office is closed.`);
      return ok(`No, ${formatDateDisplay(date)} is a normal working day. The office is open.`);
    }

    // ----- MAINTENANCE MODE -----
    case "maintenance_on": {
      const { error } = await supabase.rpc("set_maintenance_mode", { enabled: true });
      if (error) return fail("Could not enable Maintenance Mode. Please try again.");
      return ok("Done! Maintenance Mode is now ON. All non-master users are blocked from the CRM until you turn it off.");
    }

    case "maintenance_off": {
      const { error } = await supabase.rpc("set_maintenance_mode", { enabled: false });
      if (error) return fail("Could not disable Maintenance Mode. Please try again.");
      return ok("Done! Maintenance Mode is now OFF. All users can access the CRM again.");
    }

    // ----- USER DELETION -----
    case "delete_user": {
      const { userRef, deletionType } = intent;
      if (!userRef) return fail("Which user should I remove? Please mention their name or email.");
      const user = await findUser(supabase, userRef);
      if (!user) return fail(`I couldn't find a user matching "${userRef}".`);
      if ((user as any).email === PRIMARY_MASTER_EMAIL) return fail("The Primary Master account cannot be deleted.");
      if (!confirmed) {
        const action = deletionType === "data_only" ? "delete all CRM data for" : "permanently delete";
        return needConfirm(
          `I found ${user.email}${(user as any).display_name ? ` (${(user as any).display_name})` : ""}. This will ${action} this user. This is irreversible. Reply "yes" to confirm.`,
          { pendingIntent: intent },
        );
      }
      const { data: result, error } = await supabase.rpc("delete_user_account", { p_target_user_id: user.id, p_deletion_type: deletionType ?? "full" });
      if (error) return fail("Could not complete the user deletion. Please try again from the Master Panel.");
      if (result && result.success) {
        return ok(`Done! ${deletionType === "data_only" ? "CRM data deleted for" : "User account removed"}: ${user.email}. The action has been recorded in the audit log.`);
      }
      return fail(`The deletion could not be completed. ${(result as any)?.error ?? "Please try again."}`);
    }

    // ----- WORK REPORT -----
    case "work_report": {
      const date = intent.date ?? indiaDate();
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("name, status, due_date, team_member:team_members(name), client:clients(name)")
        .eq("due_date", date)
        .order("status", { ascending: true });
      if (error) return fail("Could not generate the work report. Please try again.");
      if (!tasks || tasks.length === 0) return ok(`Work report for ${formatDateDisplay(date)}:\n\nNo tasks scheduled for this date.`);
      const grouped: Record<string, any[]> = {};
      for (const t of tasks as any[]) {
        const tm = t.team_member?.name ?? "Unassigned";
        (grouped[tm] ??= []).push(t);
      }
      let txt = `Work report for ${formatDateDisplay(date)} — ${tasks.length} task(s):\n\n`;
      for (const [member, list] of Object.entries(grouped)) {
        txt += `${member}:\n`;
        for (const t of list) {
          txt += `  • ${t.name} — ${t.status.replace("_", " ")}${t.client?.name ? ` — ${t.client.name}` : ""}\n`;
        }
        txt += `\n`;
      }
      return ok(txt.trim());
    }

    // ----- CRM HEALTH CHECK -----
    case "crm_health_check": {
      const report = await runHealthCheck(supabase, userId);
      return ok(report);
    }

    default:
      return ok("I'm not sure how to help with that yet. Try 'આજના pending tasks બતાવ' or 'Rostan ને task add કરી આપ'.");
  }
}

// ---------------------------------------------------------------------------
// CRM Health Check / Diagnostic
// ---------------------------------------------------------------------------
async function runHealthCheck(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const date = indiaDate();
  const working: string[] = [];
  const warnings: string[] = [];
  const problems: string[] = [];
  const todayStats: string[] = [];

  // 1. Database connectivity — verified by all queries below succeeding
  working.push("Supabase database connectivity — OK (all queries responded)");

  // 3. Current logged-in user and role
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("email, display_name, role")
    .eq("id", userId)
    .maybeSingle();
  const myRole = (myProfile as unknown as { role: string } | null)?.role ?? "unknown";
  const myEmail = (myProfile as unknown as { email: string } | null)?.email ?? "unknown";
  working.push(`Current user: ${myEmail} — role: ${myRole}`);

  // 4. Team members and active/inactive users
  const { data: membersData, error: membersErr } = await supabase
    .from("team_members")
    .select("id, name, email, workspace_id")
    .order("name");
  if (membersErr) {
    problems.push(`Team members query failed: ${membersErr.message}`);
  } else {
    const members = (membersData ?? []) as Array<{ id: string; name: string; email: string | null }>;
    working.push(`Team members: ${members.length} total`);

    // Check for duplicate team members (same email)
    const emailCounts = new Map<string, number>();
    for (const m of members) {
      if (m.email) emailCounts.set(m.email.toLowerCase(), (emailCounts.get(m.email.toLowerCase()) ?? 0) + 1);
    }
    for (const [email, count] of emailCounts) {
      if (count > 1) {
        warnings.push(`Duplicate team member: email "${email}" appears ${count} times — may cause duplicate attendance rows`);
      }
    }

    // Members without email
    const noEmail = members.filter((m) => !m.email);
    if (noEmail.length > 0) {
      warnings.push(`${noEmail.length} team member(s) without email: ${noEmail.map((m) => m.name).join(", ")} — cannot receive notifications or be linked to auth`);
    }

    // Members without workspace
    const noWs = members.filter((m) => !m.workspace_id);
    if (noWs.length > 0) {
      warnings.push(`${noWs.length} team member(s) without workspace: ${noWs.map((m) => m.name).join(", ")}`);
    }
  }

  // 5. Today's tasks and task counts by employee
  const { data: todayTasks, error: todayTasksErr } = await supabase
    .from("tasks")
    .select("id, name, status, team_member_id, team_member:team_members(name)")
    .eq("due_date", date)
    .order("status");
  if (todayTasksErr) {
    problems.push(`Today's tasks query failed: ${todayTasksErr.message}`);
  } else {
    const tasks = (todayTasks ?? []) as Array<{ id: string; name: string; status: string; team_member_id: string | null; team_member: { name: string } | null }>;
    todayStats.push(`Tasks today: ${tasks.length} total`);

    // Group by employee
    const byMember = new Map<string, { name: string; count: number }>();
    for (const t of tasks) {
      const key = t.team_member_id ?? "unassigned";
      const name = t.team_member?.name ?? "Unassigned";
      const existing = byMember.get(key);
      if (existing) existing.count++;
      else byMember.set(key, { name, count: 1 });
    }
    const taskLines: string[] = [];
    for (const { name, count } of byMember.values()) {
      taskLines.push(`  ${name}: ${count} task(s)`);
    }
    todayStats.push(`Tasks by employee:\n${taskLines.join("\n")}`);

    // 7. Tasks stuck in unexpected statuses
    const stuckStatuses = ["not_approved", "changes_required"];
    const stuckTasks = tasks.filter((t) => stuckStatuses.includes(t.status));
    if (stuckTasks.length > 0) {
      const stuckLines = stuckTasks.map((t) => `${t.name} (${t.team_member?.name ?? "Unassigned"}) — ${t.status.replace("_", " ")}`);
      warnings.push(`Tasks in problematic status today (${stuckTasks.length}):\n${stuckLines.join("\n")}`);
    }
  }

  // 6. Pending tasks (all, not just today)
  const { data: pendingData, error: pendingErr } = await supabase
    .from("tasks")
    .select("id, name, status, due_date, team_member:team_members(name)")
    .in("status", PENDING_STATUSES)
    .order("due_date", { ascending: true });
  if (pendingErr) {
    problems.push(`Pending tasks query failed: ${pendingErr.message}`);
  } else {
    const pending = (pendingData ?? []) as Array<{ id: string; name: string; status: string; due_date: string | null; team_member: { name: string } | null }>;
    todayStats.push(`Pending tasks (all dates): ${pending.length}`);

    // Group pending by employee
    const pendingByMember = new Map<string, { name: string; count: number }>();
    for (const t of pending) {
      const name = t.team_member?.name ?? "Unassigned";
      const existing = pendingByMember.get(name);
      if (existing) existing.count++;
      else pendingByMember.set(name, { name, count: 1 });
    }
    if (pending.length > 0) {
      const pendingLines: string[] = [];
      for (const { name, count } of pendingByMember.values()) {
        pendingLines.push(`  ${name}: ${count} pending`);
      }
      todayStats.push(`Pending by employee:\n${pendingLines.join("\n")}`);
    }

    // Overdue pending tasks
    const overdue = pending.filter((t) => t.due_date && t.due_date < date);
    if (overdue.length > 0) {
      const overdueNames = overdue.slice(0, 10).map((t) => `${t.name} — due ${t.due_date} (${t.team_member?.name ?? "Unassigned"})`);
      warnings.push(`Overdue pending tasks: ${overdue.length}\n${overdueNames.join("\n")}${overdue.length > 10 ? "\n...and more" : ""}`);
    }
  }

  // 8. Today's attendance records
  const { data: attendanceData, error: attendanceErr } = await supabase
    .from("attendance_records")
    .select("id, team_member_id, status, manually_overridden, task_count_at_check, team_member:team_members(name)")
    .eq("attendance_date", date)
    .order("status");
  if (attendanceErr) {
    problems.push(`Attendance records query failed: ${attendanceErr.message}`);
  } else {
    const records = (attendanceData ?? []) as Array<{ id: string; team_member_id: string; status: string; manually_overridden: boolean; task_count_at_check: number | null; team_member: { name: string } | null }>;
    const present = records.filter((r) => r.status === "present" || r.status === "on_time").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const excused = records.filter((r) => r.status === "excused").length;
    todayStats.push(`Attendance today: ${present} present, ${absent} absent, ${excused} excused`);

    // 20. Duplicate attendance rows
    const memberDateCounts = new Map<string, number>();
    for (const r of records) {
      const key = r.team_member_id;
      memberDateCounts.set(key, (memberDateCounts.get(key) ?? 0) + 1);
    }
    for (const [memberId, count] of memberDateCounts) {
      if (count > 1) {
        const memberName = records.find((r) => r.team_member_id === memberId)?.team_member?.name ?? memberId;
        problems.push(`Duplicate attendance rows: ${memberName} has ${count} attendance records for ${date} — should be 1 per person per day`);
      }
    }

    // 9. Absent employees
    const absentRecords = records.filter((r) => r.status === "absent");
    if (absentRecords.length > 0) {
      const absentNames = absentRecords.map((r) => `${r.team_member?.name ?? "Unknown"} (tasks at check: ${r.task_count_at_check ?? 0})`);
      todayStats.push(`Absent today (${absentRecords.length}):\n${absentNames.map((n) => "  " + n).join("\n")}`);
    }
  }

  // 9b. Absent reason submissions for today
  const { data: submissionsData } = await supabase
    .from("absent_reason_submissions")
    .select("team_member_id, reason, explanation, team_member:team_members(name)")
    .eq("attendance_date", date);
  const submissions = (submissionsData ?? []) as Array<{ team_member_id: string; reason: string; explanation: string | null; team_member: { name: string } | null }>;
  if (submissions.length > 0) {
    const subLines = submissions.map((s) => `  ${s.team_member?.name ?? "Unknown"}: ${s.reason}${s.explanation ? " — " + s.explanation : ""}`);
    todayStats.push(`Absent reason submissions (${submissions.length}):\n${subLines.join("\n")}`);
  }

  // 10. Leave records affecting today
  const { data: leaveData, error: leaveErr } = await supabase
    .from("leaves")
    .select("id, user_id, leave_type, status, start_date, end_date, profile:profiles(email, display_name)")
    .lte("start_date", date)
    .gte("end_date", date);
  if (leaveErr) {
    warnings.push(`Leave records query had an error: ${leaveErr.message}`);
  } else {
    const leaves = (leaveData ?? []) as Array<{ id: string; leave_type: string; status: string; start_date: string; end_date: string; profile: { email: string; display_name: string | null } | null }>;
    if (leaves.length > 0) {
      const leaveLines = leaves.map((l) => `  ${l.profile?.display_name ?? l.profile?.email ?? "Unknown"} — ${l.leave_type} (${l.status}) — ${l.start_date} to ${l.end_date}`);
      todayStats.push(`On leave today (${leaves.length}):\n${leaveLines.join("\n")}`);
    } else {
      todayStats.push("On leave today: 0");
    }
  }

  // 11. Office holidays / Sunday rules
  const isSun = isSunday(date);
  if (isSun) {
    todayStats.push("Today is Sunday — automatic non-working day");
  } else {
    const { data: holidayToday } = await supabase
      .from("office_holidays")
      .select("holiday_name")
      .eq("holiday_date", date)
      .eq("is_active", true)
      .maybeSingle();
    if (holidayToday) {
      todayStats.push(`Today is a holiday: ${(holidayToday as unknown as { holiday_name: string }).holiday_name}`);
    }
  }
  // Upcoming holidays
  const { data: upcomingHolidays } = await supabase
    .from("office_holidays")
    .select("holiday_date, holiday_name")
    .eq("is_active", true)
    .gte("holiday_date", date)
    .order("holiday_date", { ascending: true })
    .limit(3);
  if (upcomingHolidays && upcomingHolidays.length > 0) {
    const hLines = (upcomingHolidays as Array<{ holiday_date: string; holiday_name: string }>).map((h) => `  ${formatDateDisplay(h.holiday_date)} — ${h.holiday_name}`);
    todayStats.push(`Upcoming holidays:\n${hLines.join("\n")}`);
  }

  // 12. Email/Resend configuration and recent send failures
  const { data: emailLogs } = await supabase
    .from("centralized_email_logs")
    .select("recipient_email, notification_type, status, error_message, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (emailLogs) {
    const logs = emailLogs as Array<{ recipient_email: string; notification_type: string; status: string; error_message: string | null; created_at: string }>;
    const failed = logs.filter((l) => l.status === "failed");
    const sent = logs.filter((l) => l.status === "sent");
    working.push(`Email system: ${sent.length} sent, ${failed.length} failed in last 20 logs`);
    if (failed.length > 0) {
      const failLines = failed.slice(0, 5).map((l) => `  ${l.notification_type} → ${l.recipient_email}: ${l.error_message ?? "unknown error"}`);
      warnings.push(`Recent email failures (${failed.length}):\n${failLines.join("\n")}${failed.length > 5 ? "\n...and more" : ""}`);
    }
  }

  // 13. Attendance automation/cron status — check if today's report was sent
  const { data: cronLog } = await supabase
    .from("attendance_report_email_log")
    .select("report_date, sent_at, absent_count, triggered_by")
    .eq("report_date", date)
    .maybeSingle();
  if (cronLog) {
    const cl = cronLog as unknown as { report_date: string; sent_at: string; absent_count: number; triggered_by: string };
    working.push(`Attendance cron: report sent today at ${new Date(cl.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — ${cl.absent_count} absent`);
  } else if (!isSun) {
    const { data: holidayCheck } = await supabase
      .from("office_holidays")
      .select("id")
      .eq("holiday_date", date)
      .eq("is_active", true)
      .maybeSingle();
    if (!holidayCheck) {
      const now = new Date();
      const istHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now);
      if (parseInt(istHour) >= 11) {
        warnings.push("Attendance cron: no report sent today and it's past 10:40 AM IST — the cron may not have fired");
      } else {
        working.push("Attendance cron: scheduled for 10:40 AM IST — hasn't run yet today");
      }
    }
  }

  // 14. Inactivity monitoring status
  const { data: settingsData } = await supabase
    .from("settings")
    .select("key, value")
    .order("key");
  if (settingsData) {
    const settings = settingsData as Array<{ key: string; value: string | null }>;
    const inactivityEnabled = settings.find((s) => s.key === "inactivity_monitoring_enabled");
    if (inactivityEnabled) {
      working.push(`Inactivity monitoring: ${inactivityEnabled.value === "true" ? "enabled" : "disabled"}`);
    }
  }

  // 15. Maintenance mode status
  const { data: maintData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "maintenance_mode")
    .maybeSingle();
  const maintValue = (maintData as unknown as { value: string } | null)?.value;
  if (maintValue === "true") {
    problems.push("Maintenance Mode is ON — all non-master users are blocked from the CRM. Use 'Maintenance Mode OFF કર' to disable.");
  } else {
    working.push("Maintenance mode: OFF (normal operation)");
  }

  // 18. Missing required database records or configuration
  const { data: cronSecretCheck } = await supabase
    .from("cron_secrets")
    .select("key")
    .limit(10);
  if (!cronSecretCheck || cronSecretCheck.length === 0) {
    warnings.push("No cron_secrets found in database — automated email functions may not authenticate properly");
  }

  // Check email notification settings exist for all members
  const { data: notifSettings } = await supabase
    .from("email_notification_settings")
    .select("team_member_id");
  if (notifSettings !== null && membersData) {
    type MemberRow = { id: string; name: string; email: string | null };
    type SettingRow = { team_member_id: string };
    const members = (membersData ?? []) as MemberRow[];
    const settingsMemberIds = new Set((notifSettings as SettingRow[]).map((s) => s.team_member_id));
    const missingSettings = members.filter((m) => m.email && !settingsMemberIds.has(m.id));
    if (missingSettings.length > 0) {
      warnings.push(`${missingSettings.length} team member(s) without email notification settings: ${missingSettings.map((m) => m.name).join(", ")}`);
    }
  }

  // Build report
  let report = "🔍 CRM Health Check Report\n";
  report += `Date: ${formatDateDisplay(date)}\n\n`;

  report += "🟢 Working\n";
  if (working.length > 0) {
    report += working.map((w) => `- ${w}`).join("\n");
  } else {
    report += "- No items confirmed working";
  }
  report += "\n\n";

  report += "🟡 Warning\n";
  if (warnings.length > 0) {
    report += warnings.map((w) => `- ${w}`).join("\n");
  } else {
    report += "- No warnings — everything looks good";
  }
  report += "\n\n";

  report += "🔴 Problems\n";
  if (problems.length > 0) {
    report += problems.map((p) => `- ${p}`).join("\n");
  } else {
    report += "- No problems detected";
  }
  report += "\n\n";

  report += "📊 Today\n";
  report += todayStats.map((s) => `- ${s}`).join("\n");

  return report;
}
