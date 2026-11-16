import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";

const VERSION = "1.0.2";

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

interface ParsedCommand {
  action: "create" | "remove" | "list" | "none";
  date: string | null;
  holidayName: string | null;
  rawText: string;
}

function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function indiaTomorrow(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrow);
}

function isSunday(dateStr: string): boolean {
  const date = new Date(dateStr + "T12:00:00+05:30");
  return date.getDay() === 0;
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00+05:30");
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function mentionsSunday(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("sunday") ||
    lower.includes("ravivar") ||
    lower.includes("રવિવાર");
}

function hasSpecificDate(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/i.test(lower)) return true;
  if (/\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(lower)) return true;
  if (lower.includes("today") || lower.includes("tomorrow") ||
      lower.includes("આજે") || lower.includes("કાલે") || lower.includes("આવતીકાલે")) {
    return true;
  }
  return false;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Parse natural language to a holiday command
// Supports: English, Gujarati, mixed
// Examples:
//   "Tomorrow office is closed"
//   "કાલે office બંધ છે"
//   "25 September office holiday છે"
//   "25 September Janmashtami holiday છે"
//   "Remove 25 September holiday"
//   "Show upcoming office holidays"
//   "આવતીકાલે office બંધ છે"
function parseCommand(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();
  const now = indiaDate();
  const tomorrow = indiaTomorrow();

  // --- Detect action ---
  let action: ParsedCommand["action"] = "none";

  // Removal keywords
  const removeKeywords = [
    "remove", "delete", "cancel", "undo",
    "દૂર કર", "રદ કર", "કાઢી નાખ",
  ];
  // List/show keywords
  const listKeywords = [
    "show", "list", "upcoming", "display", "view", "what holidays",
    "બતાવ", "યાદી", "કયા", "શું",
  ];
  // Create keywords
  const createKeywords = [
    "closed", "holiday", "bandh", "bandh che", "bandh chhe",
    "office closed", "office is closed", "set holiday", "add holiday",
    "બંધ", "બંધ છે", "રજા", "રજા છે",
  ];

  if (removeKeywords.some((kw) => lower.includes(kw))) {
    action = "remove";
  } else if (listKeywords.some((kw) => lower.includes(kw))) {
    action = "list";
  } else if (createKeywords.some((kw) => lower.includes(kw))) {
    action = "create";
  }

  // If we see a date but no explicit keyword, check for "office" + "closed/bandh" patterns
  if (action === "none") {
    if (lower.includes("office") && (lower.includes("bandh") || lower.includes("closed") || lower.includes("બંધ"))) {
      action = "create";
    }
  }

  // --- Detect date ---
  let date: string | null = null;

  // "today" / "આજે"
  if (lower.includes("today") || lower.includes("આજે") || lower.includes("aaje")) {
    date = now;
  }
  // "tomorrow" / "કાલે" / "આવતીકાલે"
  else if (lower.includes("tomorrow") || lower.includes("કાલે") || lower.includes("આવતીકાલે") || lower.includes("kalae") || lower.includes("aavtikale")) {
    date = tomorrow;
  }

  // Date patterns: "25 September", "25 sep", "25/09", "2026-09-25", "September 25"
  if (!date) {
    const months: Record<string, string> = {
      january: "01", jan: "01",
      february: "02", feb: "02",
      march: "03", mar: "03",
      april: "04", apr: "04",
      may: "05",
      june: "06", jun: "06",
      july: "07", jul: "07",
      august: "08", aug: "08",
      september: "09", sep: "09", sept: "09",
      october: "10", oct: "10",
      november: "11", nov: "11",
      december: "12", dec: "12",
    };

    // Pattern: DD MonthName [YYYY]
    const dateMatch1 = lower.match(/(\d{1,2})\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?/);
    if (dateMatch1) {
      const day = dateMatch1[1].padStart(2, "0");
      const month = months[dateMatch1[2]];
      const year = dateMatch1[3] ?? now.slice(0, 4);
      date = `${year}-${month}-${day}`;
    }

    // Pattern: MonthName DD [YYYY]
    if (!date) {
      const dateMatch2 = lower.match(/(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:\s+(\d{4}))?/);
      if (dateMatch2) {
        const month = months[dateMatch2[1]];
        const day = dateMatch2[2].padStart(2, "0");
        const year = dateMatch2[3] ?? now.slice(0, 4);
        date = `${year}-${month}-${day}`;
      }
    }

    // Pattern: DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
    if (!date) {
      const dateMatch3 = lower.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
      if (dateMatch3) {
        const p1 = dateMatch3[1];
        const p2 = dateMatch3[2];
        const p3 = dateMatch3[3];
        if (p1.length === 4) {
          // YYYY-MM-DD
          date = `${p1}-${p2.padStart(2, "0")}-${p3.padStart(2, "0")}`;
        } else {
          // DD/MM/YYYY or DD-MM-YYYY
          const year = p3.length === 4 ? p3 : now.slice(0, 4);
          date = `${year}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
        }
      }
    }
  }

  // --- Detect holiday name ---
  let holidayName: string | null = null;

  if (action === "create" && date) {
    // Try to extract the holiday name
    // Remove date-related words from the original text to isolate the name
    let cleaned = text;

    // Remove common structural words (English + Gujarati)
    const structuralWords = [
      "office", "is", "closed", "holiday", "છે", "બંધ", "રજા",
      "today", "tomorrow", "આજે", "કાલે", "આવતીકાલે",
      "set", "add", "a", "the", "because", "of", "on", "for",
    ];

    // Remove date patterns
    cleaned = cleaned.replace(/\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/gi, "");
    cleaned = cleaned.replace(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/gi, "");
    cleaned = cleaned.replace(/\d{1,2}(st|nd|rd|th)?/gi, "");
    cleaned = cleaned.replace(/\d{4}/g, "");

    // Remove structural words
    for (const word of structuralWords) {
      cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, "gi"), "");
    }

    cleaned = cleaned.replace(/[,\u0A80-\u0AFF]+/g, "").trim();
    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    if (cleaned.length > 0) {
      holidayName = cleaned;
    } else {
      holidayName = "Office Holiday";
    }
  }

  return { action, date, holidayName, rawText: text };
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

    // Auth: must be authenticated and be the Primary Master (Viraj)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userEmail = (userData.user.email ?? "").toLowerCase();
    if (userEmail !== PRIMARY_MASTER_EMAIL) {
      return new Response(JSON.stringify({ error: "Only the Primary Master can use the Holiday Control chatbot." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { message, confirm, history } = body as {
      message?: string;
      confirm?: boolean;
      history?: ChatMessage[];
    };

    // If confirm=true, we process the pending action from history
    if (confirm && history && history.length > 0) {
      // Find the last assistant message that contains a pending action
      // The pending action is stored as a special prefix in the response
      // We look for the last user message to determine what to confirm
      const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        const parsed = parseCommand(lastUserMsg.content);
        if (parsed.action === "create" && parsed.date && parsed.holidayName) {
          // Check if it's Sunday
          if (isSunday(parsed.date)) {
            return new Response(JSON.stringify({
              response: `${formatDateDisplay(parsed.date)} is already a Sunday — it's automatically a non-working day. No holiday entry needed.`,
              version: VERSION,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Check for existing active holiday
          const { data: existing } = await supabase
            .from("office_holidays")
            .select("id, holiday_name")
            .eq("holiday_date", parsed.date)
            .eq("is_active", true)
            .maybeSingle();

          if (existing) {
            // Update existing
            const { error: updateError } = await supabase
              .from("office_holidays")
              .update({ holiday_name: parsed.holidayName, is_active: true })
              .eq("id", existing.id);

            if (updateError) {
              return new Response(JSON.stringify({
                response: `Could not save the holiday: ${updateError.message}. Please try again.`,
                version: VERSION,
              }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            return new Response(JSON.stringify({
              response: `Done! Office holiday updated for ${formatDateDisplay(parsed.date)} — ${parsed.holidayName}. All automatic attendance, pending-task emails, and inactivity monitoring will be skipped on this day.`,
              version: VERSION,
              action: "created",
              holidayDate: parsed.date,
              holidayName: parsed.holidayName,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Insert new
          const { error: insertError } = await supabase
            .from("office_holidays")
            .insert({
              holiday_date: parsed.date,
              holiday_name: parsed.holidayName,
              is_active: true,
              created_by: userData.user.id,
            });

          if (insertError) {
            return new Response(JSON.stringify({
              response: `Could not save the holiday: ${insertError.message}. Please try again.`,
              version: VERSION,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          return new Response(JSON.stringify({
            response: `Done! Office holiday set for ${formatDateDisplay(parsed.date)} — ${parsed.holidayName}. All automatic attendance, pending-task emails, and inactivity monitoring will be skipped on this day.`,
            version: VERSION,
            action: "created",
            holidayDate: parsed.date,
            holidayName: parsed.holidayName,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (parsed.action === "remove" && parsed.date) {
          // Deactivate the holiday
          const { data: existing } = await supabase
            .from("office_holidays")
            .select("id, holiday_name")
            .eq("holiday_date", parsed.date)
            .eq("is_active", true)
            .maybeSingle();

          if (!existing) {
            if (isSunday(parsed.date)) {
              return new Response(JSON.stringify({
                response: `${formatDateDisplay(parsed.date)} is a Sunday — Sundays are automatically non-working days and cannot be removed. They reset every week automatically.`,
                version: VERSION,
              }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            return new Response(JSON.stringify({
              response: `No active office holiday found for ${formatDateDisplay(parsed.date)}.`,
              version: VERSION,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const { error: updateError } = await supabase
            .from("office_holidays")
            .update({ is_active: false })
            .eq("id", existing.id);

          if (updateError) {
            return new Response(JSON.stringify({
              response: `Could not remove the holiday: ${updateError.message}. Please try again.`,
              version: VERSION,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          return new Response(JSON.stringify({
            response: `Done! Office holiday removed for ${formatDateDisplay(parsed.date)}. Automatic attendance, pending-task emails, and inactivity monitoring will resume normally on this day.`,
            version: VERSION,
            action: "removed",
            holidayDate: parsed.date,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      return new Response(JSON.stringify({
        response: "I couldn't find a pending action to confirm. Please type your holiday command again.",
        version: VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse the user message
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({
        response: "Please type a holiday command, like: 'Tomorrow office is closed' or '25 September Janmashtami holiday'.",
        version: VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Handle Sunday questions/statements (before regular parsing) ---
    if (mentionsSunday(message) && !hasSpecificDate(message)) {
      const lower = message.toLowerCase();
      // If trying to remove/delete Sunday, inform it can't be removed
      if (lower.includes("remove") || lower.includes("delete") || lower.includes("cancel") ||
          lower.includes("દૂર કર") || lower.includes("રદ કર") || lower.includes("કાઢી નાખ")) {
        return new Response(JSON.stringify({
          response: "Sundays are automatically non-working days and cannot be removed. They reset every week automatically.",
          version: VERSION,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // For any other Sunday mention (question or statement), answer directly
      return new Response(JSON.stringify({
        response: "Yes, Sunday is automatically treated as an office off-day in the CRM. No manual holiday entry is required.\n\nEvery Sunday, the following are automatically skipped:\n• 11 AM task-based attendance check\n• Absent marking and absence emails\n• 6 PM pending-task email\n• 3-hour task inactivity monitoring\n• Automatic daily attendance/work emails\n\nAll systems resume automatically from Monday.",
        version: VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = parseCommand(message);

    // --- Handle LIST ---
    if (parsed.action === "list") {
      const today = indiaDate();
      const { data: holidays } = await supabase
        .from("office_holidays")
        .select("holiday_date, holiday_name, is_active, created_at")
        .eq("is_active", true)
        .gte("holiday_date", today)
        .order("holiday_date", { ascending: true })
        .limit(20);

      const upcoming = holidays ?? [];

      // Also show next few Sundays
      const sundays: string[] = [];
      const tempDate = new Date();
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(tempDate);
        checkDate.setDate(tempDate.getDate() + i);
        const dateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(checkDate);
        if (checkDate.getDay() === 0) {
          sundays.push(dateStr);
        }
      }

      let responseText = "Here are the upcoming office holidays:\n\n";

      if (upcoming.length > 0) {
        responseText += "Manually Added Holidays:\n";
        for (const h of upcoming) {
          responseText += `  • ${formatDateDisplay(h.holiday_date)} — ${h.holiday_name}\n`;
        }
      } else {
        responseText += "No manually-added holidays upcoming.\n";
      }

      responseText += "\nAutomatic Sundays (non-working days):\n";
      for (const s of sundays.slice(0, 4)) {
        responseText += `  • ${formatDateDisplay(s)} — Sunday\n`;
      }

      responseText += "\nSundays are automatically treated as non-working days — no need to add them manually.";

      return new Response(JSON.stringify({
        response: responseText,
        version: VERSION,
        action: "listed",
        holidays: upcoming,
        sundays: sundays.slice(0, 4),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Handle CREATE ---
    if (parsed.action === "create" && parsed.date && parsed.holidayName) {
      // Check if it's Sunday
      if (isSunday(parsed.date)) {
        return new Response(JSON.stringify({
          response: `${formatDateDisplay(parsed.date)} is a Sunday — it's already automatically treated as a non-working day. No holiday entry needed!`,
          version: VERSION,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check for existing active holiday
      const { data: existing } = await supabase
        .from("office_holidays")
        .select("id, holiday_name")
        .eq("holiday_date", parsed.date)
        .eq("is_active", true)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({
          response: `An office holiday already exists for ${formatDateDisplay(parsed.date)} — "${existing.holiday_name}". Would you like to update it to "${parsed.holidayName}"? Type "yes" to confirm, or type a new command.`,
          version: VERSION,
          pendingAction: "create",
          holidayDate: parsed.date,
          holidayName: parsed.holidayName,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Show confirmation
      return new Response(JSON.stringify({
        response: `Office holiday set for ${formatDateDisplay(parsed.date)} — ${parsed.holidayName}. Should I save it?`,
        version: VERSION,
        pendingAction: "create",
        holidayDate: parsed.date,
        holidayName: parsed.holidayName,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Handle REMOVE ---
    if (parsed.action === "remove" && parsed.date) {
      if (isSunday(parsed.date)) {
        return new Response(JSON.stringify({
          response: `${formatDateDisplay(parsed.date)} is a Sunday — Sundays are automatically non-working days and cannot be removed. They reset every week automatically.`,
          version: VERSION,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: existing } = await supabase
        .from("office_holidays")
        .select("id, holiday_name")
        .eq("holiday_date", parsed.date)
        .eq("is_active", true)
        .maybeSingle();

      if (!existing) {
        return new Response(JSON.stringify({
          response: `No active office holiday found for ${formatDateDisplay(parsed.date)}.`,
          version: VERSION,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        response: `Remove the office holiday on ${formatDateDisplay(parsed.date)} — "${existing.holiday_name}"? Type "yes" to confirm.`,
        version: VERSION,
        pendingAction: "remove",
        holidayDate: parsed.date,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Could not parse ---
    if (parsed.action === "none") {
      return new Response(JSON.stringify({
        response: "I can help you manage office holidays. Try:\n\n• \"Tomorrow office is closed\"\n• \"25 September Janmashtami holiday\"\n• \"Remove 25 September holiday\"\n• \"Show upcoming office holidays\"\n\nYou can also type in Gujarati: \"કાલે office બંધ છે\"",
        version: VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!parsed.date) {
      return new Response(JSON.stringify({
        response: "I couldn't find a date in your message. Please include a date like \"tomorrow\", \"today\", \"25 September\", or \"2026-09-25\".",
        version: VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      response: "I'm not sure what you'd like to do. Try \"Tomorrow office is closed\", \"25 September Janmashtami holiday\", or \"Remove 25 September holiday\".",
      version: VERSION,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Holiday chatbot error", error);
    return new Response(
      JSON.stringify({ error: "Holiday chatbot could not process the request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
