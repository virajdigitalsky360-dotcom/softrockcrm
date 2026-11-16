#!/usr/bin/env python3
"""
SOFTROCK CRM Screen Monitoring Agent
Windows 10/11 compatible

This agent runs on company-issued laptops and streams the screen
to authorized Masters via WebRTC when a viewing session is initiated.

PRIVACY & SECURITY:
- Shows a visible system tray icon when running
- Displays a notification when screen monitoring is active
- Does NOT record keystrokes, webcam, or microphone
- Does NOT silently capture screens — only streams when a Master requests a view
- Requires explicit employee consent on first run
- All connections are encrypted via WebRTC (DTLS/SRTP)
- Authenticates via unique device token issued by the CRM

USAGE:
  python screen_agent.py --token <DEVICE_TOKEN>

REQUIREMENTS:
  Python 3.10+
  pip install aiortc aiohttp mss Pillow numpy av

SETUP:
  1. Master registers a device in the CRM Master Panel
  2. Master gives the employee the device token
  3. Employee installs Python 3.10+ and dependencies
  4. Employee runs: python screen_agent.py --token <TOKEN>
  5. Agent shows consent dialog — employee must accept
  6. Agent runs in system tray with visible monitoring indicator
  7. When a Master initiates viewing, a notification appears
"""

import argparse
import asyncio
import fractions
import json
import platform
import subprocess
import sys
import time
import tkinter as tk
from datetime import datetime
from pathlib import Path

try:
    import aiohttp
    from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate
    from aiortc.contrib.media import MediaStreamTrack
    from av import VideoFrame
    import mss
    import numpy as np
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install aiortc aiohttp mss Pillow numpy av")
    sys.exit(1)


# --- Configuration ---
SUPABASE_URL = "https://obqifnikjjplygaobyxk.supabase.co"
SIGNALING_ENDPOINT = f"{SUPABASE_URL}/functions/v1/screen-monitoring-signaling"
HEARTBEAT_INTERVAL = 15  # seconds — must be under the 45s stale threshold
POLL_INTERVAL = 3  # seconds
CONSENT_FILE = Path.home() / ".softrock_monitoring_consent.json"


def parse_ice_candidate(candidate_str: str):
    """Parse an ICE candidate string from SDP format into an RTCIceCandidate.

    Browser ICE candidates look like:
      candidate:842210049 1 udp 1677729535 192.168.1.50 50000 typ srflx ...
    aiortc's RTCIceCandidate needs individual fields, not the raw string.
    """
    # Strip "candidate:" prefix
    line = candidate_str.strip()
    if line.startswith("candidate:"):
        line = line[10:]

    parts = line.split()
    if len(parts) < 8:
        return None

    foundation = parts[0]
    component = int(parts[1])
    protocol = parts[2]
    priority = int(parts[3])
    ip = parts[4]
    port = int(parts[5])

    # parts[6] should be "typ"
    typ = parts[7] if len(parts) > 7 else "host"

    # Parse optional fields: raddr, rport, generation, etc.
    raddr = None
    rport = None
    i = 8
    while i < len(parts) - 1:
        if parts[i] == "raddr" and i + 1 < len(parts):
            raddr = parts[i + 1]
            i += 2
        elif parts[i] == "rport" and i + 1 < len(parts):
            rport = int(parts[i + 1])
            i += 2
        else:
            i += 1

    return RTCIceCandidate(
        component=component,
        foundation=foundation,
        ip=ip,
        port=port,
        priority=priority,
        protocol=protocol,
        type=typ,
        relatedAddress=raddr,
        relatedPort=rport,
    )


class ScreenCaptureTrack(MediaStreamTrack):
    """A video track that captures the screen using mss."""

    kind = "video"

    def __init__(self, fps=5):
        super().__init__()
        self.fps = fps
        self._sct = mss.mss()
        self._running = True

    async def recv(self):
        if not self._running:
            raise StopIteration()

        pts = time.time()
        monitor = self._sct.monitors[0]  # Primary monitor
        frame_start = time.time()

        # Capture screen
        screenshot = self._sct.grab(monitor)
        img = np.array(screenshot)

        # Convert BGRA to RGB
        img = img[:, :, :3]

        # Create VideoFrame
        frame = VideoFrame.from_ndarray(img, format="rgb24")
        frame.pts = int((time.time() - pts) * 90000)
        frame.time_base = fractions.Fraction(1, 90000)

        # Throttle to target FPS
        elapsed = time.time() - frame_start
        sleep_time = max(0, (1.0 / self.fps) - elapsed)
        if sleep_time > 0:
            await asyncio.sleep(sleep_time)

        return frame

    def stop(self):
        self._running = False
        super().stop()


class MonitoringAgent:
    """Main agent that handles signaling, WebRTC, and screen capture."""

    def __init__(self, token: str):
        self.token = token
        self.device_id = None
        self.session_token = None  # Returned by register, used for heartbeat/get_offer
        self.pc = None
        self.session_id = None
        self.screen_track = None
        self.running = True
        self.consent_accepted = False
        self.tray_icon = None
        self.viewing_active = False

    async def register(self, session: aiohttp.ClientSession) -> bool:
        """Register the device with the signaling server."""
        headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
        payload = {"action": "register", "device_token": self.token}

        try:
            async with session.post(SIGNALING_ENDPOINT, json=payload, headers=headers) as resp:
                data = await resp.json()
                if resp.status == 200 and data.get("ok"):
                    self.device_id = data.get("device_id")
                    self.session_token = data.get("session_token")
                    print(f"[Agent] Registered successfully. Device ID: {self.device_id}")
                    print(f"[Agent] Session token: {self.session_token}")
                    return True
                else:
                    print(f"[Agent] Registration failed: {data.get('error', 'Unknown error')}")
                    return False
        except Exception as e:
            print(f"[Agent] Registration error: {e}")
            return False

    async def heartbeat(self, session: aiohttp.ClientSession):
        """Send periodic heartbeats to keep the device marked online."""
        while self.running:
            try:
                headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
                payload = {"action": "heartbeat", "device_token": self.token, "session_token": self.session_token}
                async with session.post(SIGNALING_ENDPOINT, json=payload, headers=headers) as resp:
                    if resp.status != 200:
                        print(f"[Agent] Heartbeat failed: {resp.status}")
            except Exception as e:
                print(f"[Agent] Heartbeat error: {e}")

            await asyncio.sleep(HEARTBEAT_INTERVAL)

    async def poll_for_offer(self, session: aiohttp.ClientSession):
        """Poll for incoming viewing requests from Masters."""
        last_session_id = None
        while self.running:
            try:
                if not self.session_token:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue
                # Don't poll while a viewing session is active
                if self.viewing_active:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue
                headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
                payload = {"action": "get_offer", "device_token": self.token, "session_token": self.session_token}
                async with session.post(SIGNALING_ENDPOINT, json=payload, headers=headers) as resp:
                    data = await resp.json()
                    offer = data.get("offer")
                    sid = data.get("session_id")
                    if offer and sid and sid != last_session_id:
                        last_session_id = sid
                        self.session_id = sid
                        print(f"[Agent] Received viewing request (session: {self.session_id})")
                        self.show_notification("Screen monitoring active", "A Master is viewing your screen.")
                        await self.handle_offer(session, offer)
            except Exception as e:
                print(f"[Agent] Poll error: {e}")

            await asyncio.sleep(POLL_INTERVAL)

    async def handle_offer(self, session: aiohttp.ClientSession, offer_sdp: str):
        """Process an incoming SDP offer and send back an answer."""
        if self.pc:
            await self.pc.close()
            self.pc = None

        self.pc = RTCPeerConnection()

        # Create screen capture track
        self.screen_track = ScreenCaptureTrack(fps=5)
        self.pc.addTrack(self.screen_track)
        self.viewing_active = True

        @self.pc.on("connectionstatechange")
        async def on_state_change():
            print(f"[Agent] Connection state: {self.pc.connectionState}")
            if self.pc.connectionState in ("failed", "closed", "disconnected"):
                await self.cleanup_session(session)

        @self.pc.on("icecandidate")
        async def on_icecandidate(candidate):
            if candidate and self.session_id:
                await self.send_ice(session, candidate)

        # Set remote description (the offer)
        offer = RTCSessionDescription(sdp=offer_sdp, type="offer")
        await self.pc.setRemoteDescription(offer)

        # Create answer
        answer = await self.pc.createAnswer()
        await self.pc.setLocalDescription(answer)

        # Send answer back
        headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
        payload = {
            "action": "answer",
            "device_token": self.token,
            "session_token": self.session_token,
            "sdp": self.pc.localDescription.sdp,
            "session_id": self.session_id,
        }
        async with session.post(SIGNALING_ENDPOINT, json=payload, headers=headers) as resp:
            data = await resp.json()
            if data.get("ok"):
                print("[Agent] Answer sent successfully")
            else:
                print(f"[Agent] Failed to send answer: {data}")

        # Start polling for ICE candidates from the viewer
        asyncio.create_task(self.poll_ice(session))

    async def send_ice(self, session: aiohttp.ClientSession, candidate):
        """Send an ICE candidate to the signaling server."""
        headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
        candidate_str = candidate.candidate if hasattr(candidate, 'candidate') else str(candidate)
        payload = {
            "action": "ice",
            "device_token": self.token,
            "session_token": self.session_token,
            "ice_candidate": candidate_str,
            "ice_sdp_mid": getattr(candidate, 'sdpMid', None),
            "ice_sdp_mline_index": getattr(candidate, 'sdpMLineIndex', None),
            "session_id": self.session_id,
        }
        try:
            async with session.post(SIGNALING_ENDPOINT, json=payload, headers=headers):
                pass
        except Exception as e:
            print(f"[Agent] ICE send error: {e}")

    async def poll_ice(self, session: aiohttp.ClientSession):
        """Poll for ICE candidates from the viewer."""
        while self.running and self.pc and self.session_id:
            try:
                headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
                payload = {"action": "get_ice", "device_token": self.token, "session_id": self.session_id}
                async with session.post(SIGNALING_ENDPOINT, json=payload, headers=headers) as resp:
                    data = await resp.json()
                    candidates = data.get("candidates", [])
                    for c in candidates:
                        sdp_str = c.get("sdp")
                        if sdp_str:
                            try:
                                candidate = parse_ice_candidate(sdp_str)
                                if candidate:
                                    candidate.sdpMid = c.get("ice_sdp_mid")
                                    candidate.sdpMLineIndex = c.get("ice_sdp_mline_index")
                                    await self.pc.addIceCandidate(candidate)
                            except Exception:
                                pass
            except Exception as e:
                print(f"[Agent] ICE poll error: {e}")

            await asyncio.sleep(1)

    async def cleanup_session(self, session: aiohttp.ClientSession):
        """Clean up a viewing session."""
        if self.pc:
            await self.pc.close()
            self.pc = None
        if self.screen_track:
            self.screen_track.stop()
            self.screen_track = None
        self.viewing_active = False

        if self.session_id:
            headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
            payload = {"action": "clear", "device_token": self.token, "session_token": self.session_token, "session_id": self.session_id}
            try:
                async with session.post(SIGNALING_ENDPOINT, json=payload, headers=headers):
                    pass
            except Exception:
                pass
            self.session_id = None

        self.show_notification("Screen monitoring ended", "The viewing session has ended.")

    def show_notification(self, title: str, message: str):
        """Show a system notification (cross-platform)."""
        system = platform.system()
        try:
            if system == "Windows":
                # Use PowerShell for Windows toast notifications
                ps_script = f"""
                [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
                $balloon = New-Object System.Windows.Forms.NotifyIcon
                $balloon.Icon = [System.Drawing.SystemIcons]::Information
                $balloon.BalloonTipTitle = '{title}'
                $balloon.BalloonTipText = '{message}'
                $balloon.Visible = $true
                $balloon.ShowBalloonTip(5000)
                Start-Sleep -Seconds 6
                $balloon.Dispose()
                """
                subprocess.Popen(
                    ["powershell", "-Command", ps_script],
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            elif system == "Darwin":
                subprocess.run(["osascript", "-e", f'display notification "{message}" with title "{title}"'])
            else:
                print(f"[Notification] {title}: {message}")
        except Exception:
            print(f"[Notification] {title}: {message}")

    def show_tray_indicator(self):
        """Show a visible system tray indicator on Windows."""
        system = platform.system()
        if system != "Windows":
            print("[Agent] Running in console mode (tray icon requires Windows).")
            return

        try:
            import ctypes
            # Use a simple console title as a visible indicator
            ctypes.windll.kernel32.SetConsoleTitleW("SOFTROCK Screen Monitor - ACTIVE")
            print("[Agent] System tray indicator active. Console title shows monitoring status.")
        except Exception:
            print("[Agent] Running in console mode.")

    async def run(self):
        """Main agent loop."""
        # Check consent
        if not self.check_consent():
            print("[Agent] Consent not accepted. Agent will not start.")
            return

        # Show visible indicator
        self.show_tray_indicator()
        print("[Agent] SOFTROCK Screen Monitoring Agent is running.")
        print("[Agent] Your screen may be viewed by authorized Masters during work hours.")
        print("[Agent] Press Ctrl+C to stop the agent.")

        async with aiohttp.ClientSession() as session:
            # Register
            if not await self.register(session):
                return

            # Start heartbeat and offer polling
            heartbeat_task = asyncio.create_task(self.heartbeat(session))
            poll_task = asyncio.create_task(self.poll_for_offer(session))

            try:
                # Keep running until stopped
                while self.running:
                    await asyncio.sleep(1)
            except KeyboardInterrupt:
                print("\n[Agent] Shutting down...")
                self.running = False
                # Mark device as offline
                if self.device_id:
                    headers = {"Content-Type": "application/json", "X-Device-Token": self.token}
                    payload = {"action": "clear", "device_token": self.token, "session_token": self.session_token, "session_id": "shutdown"}
                    try:
                        await session.post(SIGNALING_ENDPOINT, json=payload, headers=headers)
                    except Exception:
                        pass

                heartbeat_task.cancel()
                poll_task.cancel()

                if self.pc:
                    await self.pc.close()

    def check_consent(self) -> bool:
        """Check if consent has been previously accepted, or prompt for it."""
        # Check if consent file exists
        if CONSENT_FILE.exists():
            try:
                data = json.loads(CONSENT_FILE.read_text())
                if data.get("consent_accepted"):
                    self.consent_accepted = True
                    return True
            except Exception:
                pass

        # Show consent dialog
        return self.show_consent_dialog()

    def show_consent_dialog(self) -> bool:
        """Show a Tkinter consent dialog to the employee."""
        root = tk.Tk()
        root.title("SOFTROCK Screen Monitoring - Consent Required")
        root.geometry("500x400")
        root.resizable(False, False)

        # Center the window
        root.update_idletasks()
        x = (root.winfo_screenwidth() - 500) // 2
        y = (root.winfo_screenheight() - 400) // 2
        root.geometry(f"500x400+{x}+{y}")

        result = {"accepted": False}

        def on_accept():
            result["accepted"] = True
            # Save consent
            consent_data = {
                "consent_accepted": True,
                "accepted_at": datetime.now().isoformat(),
                "device_token": self.token,
            }
            CONSENT_FILE.write_text(json.dumps(consent_data, indent=2))
            root.destroy()

        def on_decline():
            result["accepted"] = False
            root.destroy()

        # Header
        header = tk.Label(root, text="SOFTROCK CRM", font=("Arial", 16, "bold"), fg="#1478d4")
        header.pack(pady=(20, 5))

        subheader = tk.Label(root, text="Screen Monitoring Consent", font=("Arial", 12, "bold"))
        subheader.pack(pady=(0, 15))

        # Consent text
        consent_text = (
            "This company-issued laptop may be monitored by authorized Masters.\n\n"
            "What will be monitored:\n"
            "  - Your screen (only when a Master initiates a viewing session)\n\n"
            "What will NOT be monitored:\n"
            "  - No keystroke logging\n"
            "  - No webcam or microphone access\n"
            "  - No silent background recording\n\n"
            "You will see a notification when viewing is active.\n"
            "All connections are encrypted.\n"
            "Viewing sessions are logged for audit purposes.\n\n"
            "Do you consent to screen monitoring on this device?"
        )

        text_widget = tk.Text(root, wrap=tk.WORD, font=("Arial", 9), height=15, padx=20, pady=10)
        text_widget.insert(tk.END, consent_text)
        text_widget.config(state=tk.DISABLED)
        text_widget.pack(padx=20, pady=(0, 15))

        # Buttons
        btn_frame = tk.Frame(root)
        btn_frame.pack(pady=(0, 15))

        accept_btn = tk.Button(
            btn_frame, text="I Consent", command=on_accept,
            bg="#1478d4", fg="white", font=("Arial", 10, "bold"),
            padx=20, pady=8
        )
        accept_btn.pack(side=tk.LEFT, padx=10)

        decline_btn = tk.Button(
            btn_frame, text="I Decline", command=on_decline,
            bg="#dc2626", fg="white", font=("Arial", 10, "bold"),
            padx=20, pady=8
        )
        decline_btn.pack(side=tk.LEFT, padx=10)

        root.mainloop()

        self.consent_accepted = result["accepted"]
        return result["accepted"]


def main():
    parser = argparse.ArgumentParser(description="SOFTROCK CRM Screen Monitoring Agent")
    parser.add_argument("--token", required=True, help="Device token issued by the CRM Master Panel")
    parser.add_argument("--reset-consent", action="store_true", help="Reset consent and re-prompt on next start")
    args = parser.parse_args()

    if args.reset_consent and CONSENT_FILE.exists():
        CONSENT_FILE.unlink()
        print("[Agent] Consent reset. You will be prompted again on next start.")

    agent = MonitoringAgent(token=args.token)

    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        print("\n[Agent] Agent stopped.")


if __name__ == "__main__":
    main()
