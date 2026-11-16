SOFTROCK Screen Monitoring Agent — Windows Package
====================================================

PACKAGE CONTENTS
----------------
  install.bat            Run this first (installs Python deps, verifies token)
  start_agent.bat        Run this to start monitoring (after install)
  install_startup.bat    Makes agent auto-start on Windows login
  uninstall_startup.bat  Removes auto-start
  screen_agent.py        The monitoring agent (do not edit)
  token.txt              YOU paste your device token here
  README.txt             This file


QUICK START (3 STEPS)
---------------------

STEP 1: Install
  1. Extract this folder to your Desktop
  2. Double-click install.bat
  3. If it says Python is not found, install Python first (see below)
  4. It will ask for your token — see Step 2

STEP 2: Add Your Token
  1. Right-click token.txt > Open with > Notepad
  2. Delete all comment lines (lines starting with #)
  3. Paste ONLY your device token — nothing else
  4. Save (Ctrl+S) and close Notepad
  5. Run install.bat again to verify

  Your token looks like: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Get it from Viraj (Primary Master) via a secure channel.

STEP 3: Start Monitoring
  Double-click start_agent.bat
  - First run: a consent dialog appears — click "I Consent"
  - You'll see "Agent is running" in the window
  - Keep the window open while working
  - A notification appears when someone views your screen
  - Press Ctrl+C to stop


AUTO-START ON LOGIN (optional)
------------------------------
  Double-click install_startup.bat
  The agent will start silently on next Windows login.
  To remove: double-click uninstall_startup.bat


INSTALLING PYTHON (if not installed)
------------------------------------
  1. Go to https://www.python.org/downloads/
  2. Download Python 3.10+ (3.12 recommended)
  3. Run installer, CHECK "Add Python to PATH"
  4. Click "Install Now"
  5. Close and reopen Command Prompt
  6. Run install.bat again


HOW TO CONFIRM THE AGENT IS ONLINE
----------------------------------
On your PC:
  The window shows:
    [Agent] SOFTROCK Screen Monitoring Agent is running.
    [Agent] Registered successfully.
  Window title: "SOFTROCK Screen Monitor - ACTIVE"

In the CRM (ask Viraj or Kapil):
  1. Master Panel > Team Screen Monitoring
  2. Under "Desktop Agents" your device shows a green ONLINE badge
  3. Under "Active Screen Shares" your name shows an AGENT badge
  If it shows OFFLINE, the agent is not running or lost connection.


HOW TO CONFIRM THE LIVE SCREEN STREAM WORKS
-------------------------------------------
  1. Your agent must be running (start_agent.bat)
  2. Ask Viraj or Kapil to open Master Panel > Team Screen Monitoring
  3. They click "View Screen" next to your name
  4. A live video of your desktop appears in their browser
  5. You get a notification: "Screen monitoring active"
  6. When they close the viewer: "Screen monitoring ended"

  If the stream doesn't connect after 30 seconds:
  - Check the agent window shows "Registered successfully"
  - Check for firewall warnings — allow Python through
  - If behind a strict firewall/VPN, contact IT


STOPPING THE AGENT
------------------
  In a window: press Ctrl+C or close the window
  Silently (auto-start): Task Manager > pythonw.exe > End Task


RESETTING CONSENT
-----------------
  Open Command Prompt in this folder and run:
    python screen_agent.py --token YOUR_TOKEN --reset-consent
  Or delete: %USERPROFILE%\.softrock_monitoring_consent.json


PRIVACY GUARANTEES
------------------
  - No keystroke logging
  - No webcam or microphone access
  - No silent recording — only streams when a Master requests a view
  - You see a notification when viewing starts and stops
  - All connections encrypted (WebRTC DTLS/SRTP)
  - All viewing sessions logged for audit
  - Consent can be withdrawn by stopping the agent


TROUBLESHOOTING
---------------
"Missing dependencies"     Run install.bat again
"Invalid device token"     Check token.txt has only the token, no extra text
"Registration failed"      Check internet; verify token with Viraj
Agent runs but no stream    Check firewall; try without VPN
Consent dialog missing      Run with --reset-consent flag

TOKEN SECURITY
  - Never share token.txt except through secure channels
  - Never upload it to any website
  - If compromised, tell Viraj to delete and re-register the device
