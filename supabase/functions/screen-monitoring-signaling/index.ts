import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { closureModeAllowsRequest, closureModeIsEnabled, closureModeResponse } from "../_shared/closure_mode.ts";

/**
 * Screen Monitoring Signaling Service
 *
 * Supports two client types:
 *   1. Browser (Master viewer + Employee streamer) — authenticates via Supabase JWT
 *   2. Python desktop agent (agent/screen_agent.py) — authenticates via X-Device-Token
 *
 * Browser flow:
 *   1. Employee clicks "Share My Screen" → getDisplayMedia() → creates a session row
 *   2. Employee's browser polls for offers from Masters
 *   3. Master clicks "View" → sends SDP offer → stored in DB
 *   4. Employee reads offer, creates answer with screen track → sends back answer
 *   5. Both exchange ICE candidates via DB polling
 *   6. WebRTC connection establishes — screen streams P2P (encrypted via DTLS/SRTP)
 *
 * Agent flow (automatic, no manual "Share My Screen"):
 *   1. Master registers a device in CRM → device token generated
 *   2. Employee runs: python screen_agent.py --token <TOKEN>
 *   3. Agent registers → edge function creates a screen_share_sessions row
 *   4. Agent heartbeats keep the session alive
 *   5. Master clicks "View" → same WebRTC offer/answer/ICE flow as browser
 *   6. Agent captures screen via mss and streams via WebRTC
 *
 * Authorization:
 *   - Viewer must be Viraj or Kapil (screen monitors only)
 *   - Viraj and Kapil can never be streamers (their PCs are never captured)
 *   - Agent devices can only be registered for non-monitor users
 *   - All view sessions are logged in screen_view_logs
 */

const SCREEN_MONITOR_EMAILS = [
  "viraj.digitalsky360@gmail.com",
  "kapilprajapati9054@gmail.com",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Device-Token",
};

interface SignalingPayload {
  action: "offer" | "answer" | "ice" | "get_offer" | "get_answer" | "get_ice" | "clear" | "heartbeat" | "register";
  session_token?: string;
  device_token?: string;
  sdp?: string;
  ice_candidate?: string;
  ice_sdp_mid?: string | null;
  ice_sdp_mline_index?: number | null;
  session_id?: string;
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

    const body = await req.json() as SignalingPayload;
    const authHeader = req.headers.get("Authorization") ?? "";
    const deviceToken = req.headers.get("X-Device-Token") ?? body.device_token ?? "";

    const now = new Date().toISOString();

    // --- Device-token authentication (Python agent) ---
    if (deviceToken) {
      if (await closureModeIsEnabled(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      )) {
        return jsonResponse({ error: "CRM Closure Mode is enabled." }, 403);
      }
      return await handleAgentAction(supabase, deviceToken, body, now);
    }

    // --- JWT authentication (browser) ---
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (!(await closureModeAllowsRequest(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      authHeader,
    ))) {
      return jsonResponse({ error: "CRM Closure Mode is enabled." }, 403);
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? "";

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, email, team_member_id")
      .eq("id", userId)
      .maybeSingle();

    const role = (profile as unknown as { role: string } | null)?.role ?? "normal";
    const teamMemberId = (profile as unknown as { team_member_id: string | null } | null)?.team_member_id ?? null;
    const isMaster = role === "master";
    const isScreenMonitor = isMaster && SCREEN_MONITOR_EMAILS.includes(userEmail.toLowerCase());

    switch (body.action) {
      // --- Employee (streamer) heartbeat ---
      case "heartbeat": {
        if (!body.session_token) {
          return jsonResponse({ error: "session_token required" }, 400);
        }
        const { data: session } = await supabase
          .from("screen_share_sessions")
          .select("id, user_id, status")
          .eq("session_token", body.session_token)
          .maybeSingle();

        if (!session || (session as { user_id: string }).user_id !== userId) {
          return jsonResponse({ error: "Session not found or not owned" }, 403);
        }

        await supabase
          .from("screen_share_sessions")
          .update({ last_heartbeat_at: now, status: "sharing" })
          .eq("id", (session as { id: string }).id);

        return jsonResponse({ ok: true });
      }

      // --- Master sends offer to view an employee's screen ---
      case "offer": {
        if (!isScreenMonitor) return jsonResponse({ error: "Only Viraj and Kapil can view screens" }, 403);
        if (!body.session_token || !body.sdp) {
          return jsonResponse({ error: "session_token and sdp required" }, 400);
        }

        const { data: session } = await supabase
          .from("screen_share_sessions")
          .select("id, user_id, team_member_id, employee_email, employee_name, status")
          .eq("session_token", body.session_token)
          .maybeSingle();

        if (!session) {
          return jsonResponse({ error: "Session not found" }, 404);
        }

        const s = session as {
          id: string; user_id: string; team_member_id: string | null;
          employee_email: string; employee_name: string | null; status: string;
        };

        if (s.status !== "sharing") {
          return jsonResponse({ error: "Screen sharing is not active" }, 400);
        }

        const sessionId = body.session_id ?? crypto.randomUUID();

        await supabase.from("screen_view_logs").insert({
          team_member_id: s.team_member_id,
          viewer_user_id: userId,
          viewer_email: userEmail,
          employee_name: s.employee_name,
          action: "start_view",
          session_id: sessionId,
          started_at: now,
        });

        await supabase.from("signaling_messages").upsert({
          session_token: body.session_token,
          session_id: sessionId,
          role: "viewer",
          type: "offer",
          sdp: body.sdp,
          user_id: userId,
          created_at: now,
        }, { onConflict: "session_id,type" });

        return jsonResponse({ ok: true, session_id: sessionId });
      }

      // --- Employee polls for incoming offers ---
      case "get_offer": {
        if (!body.session_token) {
          return jsonResponse({ error: "session_token required" }, 400);
        }
        const { data: session } = await supabase
          .from("screen_share_sessions")
          .select("user_id")
          .eq("session_token", body.session_token)
          .maybeSingle();

        if (!session || (session as { user_id: string }).user_id !== userId) {
          return jsonResponse({ error: "Session not found or not owned" }, 403);
        }

        const { data: msg } = await supabase
          .from("signaling_messages")
          .select("session_id, sdp")
          .eq("session_token", body.session_token)
          .eq("type", "offer")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!msg) {
          return jsonResponse({ offer: null });
        }
        const m = msg as { session_id: string; sdp: string };
        return jsonResponse({ offer: m.sdp, session_id: m.session_id });
      }

      // --- Employee sends answer back ---
      case "answer": {
        if (!body.session_token || !body.sdp || !body.session_id) {
          return jsonResponse({ error: "session_token, sdp, and session_id required" }, 400);
        }
        const { data: session } = await supabase
          .from("screen_share_sessions")
          .select("user_id")
          .eq("session_token", body.session_token)
          .maybeSingle();

        if (!session || (session as { user_id: string }).user_id !== userId) {
          return jsonResponse({ error: "Session not found or not owned" }, 403);
        }

        await supabase.from("signaling_messages").upsert({
          session_token: body.session_token,
          session_id: body.session_id,
          role: "streamer",
          type: "answer",
          sdp: body.sdp,
          user_id: userId,
          created_at: now,
        }, { onConflict: "session_id,type" });

        return jsonResponse({ ok: true });
      }

      // --- Master polls for answer ---
      case "get_answer": {
        if (!isScreenMonitor) return jsonResponse({ error: "Only Viraj and Kapil can view screens" }, 403);
        if (!body.session_id) {
          return jsonResponse({ error: "session_id required" }, 400);
        }

        const { data: msg } = await supabase
          .from("signaling_messages")
          .select("sdp")
          .eq("session_id", body.session_id)
          .eq("type", "answer")
          .maybeSingle();

        if (!msg) {
          return jsonResponse({ answer: null });
        }
        return jsonResponse({ answer: (msg as { sdp: string }).sdp });
      }

      // --- Either party sends ICE candidate ---
      case "ice": {
        if (!body.ice_candidate || !body.session_id) {
          return jsonResponse({ error: "ice_candidate and session_id required" }, 400);
        }

        const role = isScreenMonitor ? "viewer" : "streamer";
        const sessionToken = body.session_token ?? null;

        await supabase.from("signaling_messages").insert({
          session_token: sessionToken,
          session_id: body.session_id,
          role,
          type: "ice",
          sdp: body.ice_candidate,
          ice_sdp_mid: body.ice_sdp_mid ?? null,
          ice_sdp_mline_index: body.ice_sdp_mline_index ?? null,
          user_id: userId,
          created_at: now,
        });

        return jsonResponse({ ok: true });
      }

      // --- Either party polls for ICE candidates from the other side ---
      case "get_ice": {
        if (!body.session_id) {
          return jsonResponse({ error: "session_id required" }, 400);
        }

        const wantRole = isScreenMonitor ? "streamer" : "viewer";
        const { data: msgs } = await supabase
          .from("signaling_messages")
          .select("sdp, ice_sdp_mid, ice_sdp_mline_index, created_at")
          .eq("session_id", body.session_id)
          .eq("type", "ice")
          .eq("role", wantRole)
          .order("created_at", { ascending: true })
          .limit(20);

        return jsonResponse({ candidates: msgs ?? [] });
      }

      // --- Clear signaling messages and log stop ---
      case "clear": {
        if (!body.session_id) {
          return jsonResponse({ error: "session_id required" }, 400);
        }

        await supabase
          .from("signaling_messages")
          .delete()
          .eq("session_id", body.session_id);

        if (isScreenMonitor) {
          await supabase.from("screen_view_logs").insert({
            viewer_user_id: userId,
            viewer_email: userEmail,
            action: "stop_view",
            session_id: body.session_id,
            stopped_at: now,
          });
        } else {
          if (body.session_token) {
            await supabase
              .from("screen_share_sessions")
              .update({ status: "stopped", stopped_at: now })
              .eq("session_token", body.session_token)
              .eq("user_id", userId);
          }
        }

        return jsonResponse({ ok: true });
      }

      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    console.error("Signaling error:", error);
    return jsonResponse({ error: "Signaling failed" }, 500);
  }
});

// ============================================================
// Agent action handler — device-token authenticated
// ============================================================
async function handleAgentAction(
  supabase: ReturnType<typeof createClient>,
  deviceToken: string,
  body: SignalingPayload,
  now: string,
): Promise<Response> {
  // Look up the device by token
  const { data: device, error: devError } = await supabase
    .from("monitoring_devices")
    .select("id, user_id, team_member_id, device_name, status")
    .eq("device_token", deviceToken)
    .maybeSingle();

  if (devError || !device) {
    return jsonResponse({ error: "Invalid device token" }, 403);
  }

  const d = device as {
    id: string; user_id: string; team_member_id: string | null;
    device_name: string; status: string;
  };

  switch (body.action) {
    // --- Agent registers and creates a sharing session ---
    case "register": {
      // Mark device online
      await supabase
        .from("monitoring_devices")
        .update({ status: "online", last_heartbeat_at: now })
        .eq("id", d.id);

      // Check if there's already an active session for this device
      const { data: existing } = await supabase
        .from("screen_share_sessions")
        .select("id, session_token, status")
        .eq("device_id", d.id)
        .eq("status", "sharing")
        .maybeSingle();

      if (existing) {
        const e = existing as { id: string; session_token: string; status: string };
        return jsonResponse({ ok: true, device_id: d.id, session_token: e.session_token });
      }

      // Create a new sharing session
      const sessionToken = crypto.randomUUID();

      // Get user details for the session
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, display_name")
        .eq("id", d.user_id)
        .maybeSingle();

      const p = profile as { email: string; display_name: string | null } | null;

      const { error: insertError } = await supabase
        .from("screen_share_sessions")
        .insert({
          user_id: d.user_id,
          team_member_id: d.team_member_id,
          employee_email: p?.email ?? "",
          employee_name: p?.display_name ?? d.device_name,
          status: "sharing",
          session_token: sessionToken,
          device_id: d.id,
          source: "agent",
        });

      if (insertError) {
        return jsonResponse({ error: "Failed to create session" }, 500);
      }

      return jsonResponse({ ok: true, device_id: d.id, session_token: sessionToken });
    }

    // --- Agent heartbeat ---
    case "heartbeat": {
      // Update device status
      await supabase
        .from("monitoring_devices")
        .update({ status: "online", last_heartbeat_at: now })
        .eq("id", d.id);

      // Update session heartbeat if we have a session token
      if (body.session_token) {
        await supabase
          .from("screen_share_sessions")
          .update({ last_heartbeat_at: now, status: "sharing" })
          .eq("session_token", body.session_token)
          .eq("device_id", d.id);
      }

      return jsonResponse({ ok: true });
    }

    // --- Agent polls for incoming viewing offers ---
    case "get_offer": {
      if (!body.session_token) {
        return jsonResponse({ error: "session_token required" }, 400);
      }

      // Verify this session belongs to this device
      const { data: session } = await supabase
        .from("screen_share_sessions")
        .select("id")
        .eq("session_token", body.session_token)
        .eq("device_id", d.id)
        .maybeSingle();

      if (!session) {
        return jsonResponse({ error: "Session not found or not owned" }, 403);
      }

      const { data: msg } = await supabase
        .from("signaling_messages")
        .select("session_id, sdp")
        .eq("session_token", body.session_token)
        .eq("type", "offer")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!msg) {
        return jsonResponse({ offer: null });
      }
      const m = msg as { session_id: string; sdp: string };
      return jsonResponse({ offer: m.sdp, session_id: m.session_id });
    }

    // --- Agent sends WebRTC answer back to viewer ---
    case "answer": {
      if (!body.session_token || !body.sdp || !body.session_id) {
        return jsonResponse({ error: "session_token, sdp, and session_id required" }, 400);
      }

      const { data: session } = await supabase
        .from("screen_share_sessions")
        .select("id")
        .eq("session_token", body.session_token)
        .eq("device_id", d.id)
        .maybeSingle();

      if (!session) {
        return jsonResponse({ error: "Session not found or not owned" }, 403);
      }

      await supabase.from("signaling_messages").upsert({
        session_token: body.session_token,
        session_id: body.session_id,
        role: "streamer",
        type: "answer",
        sdp: body.sdp,
        user_id: d.user_id,
        created_at: now,
      }, { onConflict: "session_id,type" });

      return jsonResponse({ ok: true });
    }

    // --- Agent sends ICE candidate ---
    case "ice": {
      if (!body.ice_candidate || !body.session_id) {
        return jsonResponse({ error: "ice_candidate and session_id required" }, 400);
      }

      await supabase.from("signaling_messages").insert({
        session_token: body.session_token ?? null,
        session_id: body.session_id,
        role: "streamer",
        type: "ice",
        sdp: body.ice_candidate,
        ice_sdp_mid: body.ice_sdp_mid ?? null,
        ice_sdp_mline_index: body.ice_sdp_mline_index ?? null,
        user_id: d.user_id,
        created_at: now,
      });

      return jsonResponse({ ok: true });
    }

    // --- Agent polls for ICE candidates from the viewer ---
    case "get_ice": {
      if (!body.session_id) {
        return jsonResponse({ error: "session_id required" }, 400);
      }

      const { data: msgs } = await supabase
        .from("signaling_messages")
        .select("sdp, ice_sdp_mid, ice_sdp_mline_index, created_at")
        .eq("session_id", body.session_id)
        .eq("type", "ice")
        .eq("role", "viewer")
        .order("created_at", { ascending: true })
        .limit(20);

      return jsonResponse({ candidates: msgs ?? [] });
    }

    // --- Agent clears signaling and marks session stopped ---
    case "clear": {
      if (body.session_id) {
        await supabase
          .from("signaling_messages")
          .delete()
          .eq("session_id", body.session_id);
      }

      if (body.session_token) {
        await supabase
          .from("screen_share_sessions")
          .update({ status: "stopped", stopped_at: now })
          .eq("session_token", body.session_token)
          .eq("device_id", d.id);
      }

      // Mark device offline on shutdown
      if (body.session_id === "shutdown") {
        await supabase
          .from("monitoring_devices")
          .update({ status: "offline", last_heartbeat_at: now })
          .eq("id", d.id);
      }

      return jsonResponse({ ok: true });
    }

    default:
      return jsonResponse({ error: "Unknown agent action" }, 400);
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
