# SOFTROCK Screen Monitoring Agent

Windows 10/11 desktop agent for company-issued laptops. Streams the screen
to authorized Masters (Viraj and Kapil) via encrypted WebRTC when a viewing
session is requested — no manual "Share My Screen" click required.

## What It Does

- Captures the screen **only** when a Master initiates a viewing session
- Shows a visible notification when monitoring starts and stops
- Requires explicit employee consent on first run (Tkinter dialog)
- Does **NOT** log keystrokes, access webcams/microphones, or silently record
- All connections are encrypted (WebRTC DTLS/SRTP)
- Authenticates via a unique device token from the CRM
- Automatically re-registers if the agent restarts
- Heartbeats every 15 seconds keep the device marked online

## How It Connects

1. Master registers a device in the CRM (Master Panel > Team Screen Monitoring > Register Device)
2. The CRM generates a unique device token
3. The employee runs the agent with that token
4. The agent registers with the signaling server and creates a sharing session
5. The agent polls for incoming viewing offers every 3 seconds
6. When a Master clicks "View Screen", the agent receives the WebRTC offer
7. The agent captures the screen via `mss` and streams it via WebRTC
8. When the Master stops viewing, the agent cleans up and resumes polling

## Windows Installation

### Step 1: Install Python 3.10+

1. Go to https://www.python.org/downloads/
2. Download Python 3.10 or newer (3.12 recommended)
3. Run the installer
4. **Important:** Check the box "Add Python to PATH" during installation
5. Click "Install Now"

### Step 2: Install dependencies

Open **Command Prompt** (press `Win+R`, type `cmd`, press Enter) and run:

```
pip install aiortc aiohttp mss Pillow numpy av
```

If you get a permissions error, try:

```
pip install --user aiortc aiohttp mss Pillow numpy av
```

### Step 3: Get the device token from your Master

Viraj (Primary Master) will register your device in the CRM and give you:
- A device token (a long string like `a1b2c3d4-e5f6-...`)
- The `screen_agent.py` file

Save `screen_agent.py` to a folder on your desktop, for example:
```
C:\Users\YourName\Desktop\screen_agent\screen_agent.py
```

### Step 4: Run the agent

Open **Command Prompt** and navigate to the folder:

```
cd C:\Users\YourName\Desktop\screen_agent
```

Run the agent with your token:

```
python screen_agent.py --token PASTE-YOUR-TOKEN-HERE
```

### Step 5: Consent dialog

On first run, a consent dialog appears. Read it carefully and click **I Consent**
to proceed. Consent is saved to `~/.softrock_monitoring_consent.json` and won't
be asked again unless you use `--reset-consent`.

### Step 6: Agent is running

You'll see:
```
[Agent] SOFTROCK Screen Monitoring Agent is running.
[Agent] Your screen may be viewed by authorized Masters during work hours.
[Agent] Press Ctrl+C to stop the agent.
```

The console window title shows "SOFTROCK Screen Monitor - ACTIVE".
Keep this window open while working. When a Master views your screen, a
Windows notification appears.

## Running Automatically on Startup

### Option A: Startup folder (recommended)

1. Create a batch file `start_monitor.bat` in the same folder as `screen_agent.py`:

```bat
@echo off
cd /d "%~dp0"
pythonw screen_agent.py --token PASTE-YOUR-TOKEN-HERE
```

2. Press `Win+R`, type `shell:startup`, press Enter
3. Copy `start_monitor.bat` into the Startup folder

The agent will start silently (no console window) when you log in.

### Option B: Task Scheduler

1. Open Task Scheduler (`Win+R` > `taskschd.msc`)
2. Click "Create Basic Task"
3. Name: "SOFTROCK Screen Monitor"
4. Trigger: "When I log on"
5. Action: "Start a program"
6. Program: `pythonw.exe`
7. Arguments: `C:\path\to\screen_agent.py --token YOUR-TOKEN`
8. Finish

## Resetting Consent

If consent needs to be re-obtained (e.g., new employee using the laptop):

```
python screen_agent.py --token PASTE-YOUR-TOKEN-HERE --reset-consent
```

This deletes the saved consent file and prompts again on next start.

## Stopping the Agent

- If running in a console window: press `Ctrl+C`
- If running via `pythonw` (background): open Task Manager, find `pythonw.exe`,
  and end the process

When stopped, the agent marks the device as offline in the CRM.

## Troubleshooting

### "Missing dependencies" error

Run the pip install command again:
```
pip install aiortc aiohttp mss Pillow numpy av
```

### "Registration failed: Invalid device token"

- Check that you copied the full token (it's a UUID with hyphens)
- Ask Viraj to verify the device is registered in the CRM
- The token may have been deleted — ask for a new one

### Agent says "Registered successfully" but Master can't see the screen

- Ensure you're on the same network or have internet connectivity
- The WebRTC connection uses STUN servers for NAT traversal
- If behind a strict firewall, the connection may fail — contact IT

### Consent dialog doesn't appear

- Run with `--reset-consent` to force the dialog again
- Ensure you have a display connected (the dialog is graphical)

## Privacy Guarantees

- No keystroke logging
- No webcam or microphone access
- No silent background recording — only streams when a Master requests a view
- Employee sees a notification when viewing starts and stops
- All viewing sessions are logged in the CRM with viewer name, employee, and timestamps
- Connections are encrypted end-to-end via WebRTC (DTLS/SRTP)
- Consent can be withdrawn at any time by stopping the agent
