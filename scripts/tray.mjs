#!/usr/bin/env node
/**
 * StableClaw System Tray - Cross-platform system tray icon for controlling the Gateway daemon.
 *
 * Provides a system tray/menu-bar icon with context menu options to:
 *   - Start / Stop the Gateway daemon service
 *   - Open the Dashboard in a browser
 *   - Open the Onboard wizard
 *   - Exit the tray process
 *
 * Platform implementations:
 *   - macOS:  Uses osascript + JXA (no external deps)
 *   - Windows: Uses PowerShell + System.Windows.Forms (no external deps)
 *   - Linux:  Uses python3 + gi (Gtk/AppIndicator3) (no external deps beyond python3-gi)
 */

import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ── Utility helpers ──────────────────────────────────────

function getPlatform() {
  return process.platform;
}

/**
 * Resolve the path to the stableclaw CLI binary.
 * Checks in order:
 *   1. Development: project root symlink/binary
 *   2. Global PATH resolution (for npm global installs)
 *   3. process.env._ (shell-provided, last resort)
 */
function resolveBinPath() {
  // Check development path first
  const devPath = join(PROJECT_ROOT, process.platform === "win32" ? "stableclaw.cmd" : "stableclaw");
  if (existsSync(devPath)) return devPath;

  // Check process.env._ (set by bash/zsh to last executed command)
  if (process.env._ && existsSync(process.env._)) return process.env._;

  // Fall back to PATH lookup
  return "stableclaw";
}

const BIN = resolveBinPath();

/**
 * Open a URL in the default browser, cross-platform.
 */
function openUrl(url) {
  const platform = getPlatform();
  let cmd;
  let args;
  if (platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (platform === "win32") {
    // Use cmd /c start on Windows — "start" is a CMD built-in, not a standalone executable
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }
  spawn(cmd, args, { stdio: "ignore", detached: true, shell: platform === "win32" }).unref();
}

/**
 * Create a temporary script file with cleanup on process exit.
 * Returns the path to the created file.
 */
function writeTempScript(content, ext) {
  const dir = join(tmpdir(), "stableclaw-tray");
  mkdirSync(dir, { recursive: true });
  const suffix = randomBytes(4).toString("hex");
  const scriptPath = join(dir, `tray-${Date.now()}-${suffix}${ext}`);
  writeFileSync(scriptPath, content, "utf8");
  return scriptPath;
}

// ── macOS Tray (osascript + JXA) ──────────────────────────

function createMacOSTray() {
  const script = `
    ObjC.import("AppKit");

    const app = $.NSApplication.sharedApplication;
    app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);

    const statusBarItem = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
    statusBarItem.button.title = "SC";
    statusBarItem.button.toolTip = "StableClaw Gateway";

    const menu = $.NSMenu.alloc.init;

    // Start
    const startItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("▶ Start", "startDaemon:", "");
    menu.addItem(startItem);

    // Stop
    const stopItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("⏹ Stop", "stopDaemon:", "");
    menu.addItem(stopItem);

    // Separator
    menu.addItem($.NSMenuItem.separatorItem);

    // Open Dashboard
    const dashItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("🌐 Open Dashboard", "openDashboard:", "");
    menu.addItem(dashItem);

    // Onboard
    const onboardItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("📋 Onboard", "openOnboard:", "");
    menu.addItem(onboardItem);

    // Separator
    menu.addItem($.NSMenuItem.separatorItem);

    // Status display (disabled menu item, updated by timer)
    const statusMenuItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("Status: Checking...", "checkStatus:", "");
    statusMenuItem.enabled = false;
    menu.addItem(statusMenuItem);

    // Separator
    menu.addItem($.NSMenuItem.separatorItem);

    // Exit
    const exitItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("❌ Exit", "exitApp:", "");
    menu.addItem(exitItem);

    statusBarItem.menu = menu;

    // ── Single delegate class with all handlers ──
    ObjC.registerSubclass({
      name: "TrayDelegate",
      methods: {
        "startDaemon:": function (sender) {
          $.NSTask.launchedTaskWithLaunchPathArguments(
            "/usr/bin/env",
            ["node", "${BIN}", "daemon", "start"]
          );
          statusMenuItem.title = "Status: Starting...";
        },
        "stopDaemon:": function (sender) {
          $.NSTask.launchedTaskWithLaunchPathArguments(
            "/usr/bin/env",
            ["node", "${BIN}", "daemon", "stop"]
          );
          statusMenuItem.title = "Status: Stopping...";
        },
        "openDashboard:": function (sender) {
          $.NSWorkspace.sharedWorkspace.openURL(
            $.NSURL.URLWithString("http://localhost:18789")
          );
        },
        "openOnboard:": function (sender) {
          $.NSWorkspace.sharedWorkspace.openURL(
            $.NSURL.URLWithString("http://localhost:18789/onboard")
          );
        },
        "checkStatus:": function (sender) {
          // Run daemon status synchronously and update the status menu item
          var task = $.NSTask.alloc.init;
          task.launchPath = "/usr/bin/env";
          task.arguments = ["node", "${BIN}", "daemon", "status", "--json"];
          var pipe = $.NSPipe.pipe;
          task.standardOutput = pipe;
          task.standardError = $.NSPipe.pipe;
          task.launch;
          task.waitUntilExit;

          var data = pipe.fileHandleForReading.readDataToEndOfFile;
          var output = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
          var statusText = "Status: Unknown";

          if (output && output.length > 0) {
            try {
              var jsonStr = output.toString;
              // Simple string-based check since JXA JSON parsing can be tricky
              if (jsonStr.indexOf('"running"') !== -1 || jsonStr.indexOf('"running":true') !== -1 || jsonStr.indexOf('"running": true') !== -1) {
                if (jsonStr.indexOf('"running":true') !== -1 || jsonStr.indexOf('"running": true') !== -1) {
                  statusText = "Status: Running";
                } else {
                  statusText = "Status: Stopped";
                }
              } else {
                // Try parsing as JSON for nested state.running
                var parsed = JSON.parse(jsonStr);
                if (parsed.running === true) {
                  statusText = "Status: Running";
                } else if (parsed.state && parsed.state.running === true) {
                  statusText = "Status: Running";
                } else {
                  statusText = "Status: Stopped";
                }
              }
            } catch (e) {
              statusText = "Status: Error";
            }
          }

          statusMenuItem.title = statusText;
        },
        "exitApp:": function (sender) {
          $.NSApplication.sharedApplication.terminate(nil);
        },
      },
    });

    var delegate = $.TrayDelegate.alloc.init;
    app.delegate = delegate;

    // Periodic status check every 5 seconds
    $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
      5.0, delegate, "checkStatus:", null, true
    );

    // Run initial status check
    delegate.checkStatus(null);

    app.run;
  `;

  const child = spawn("osascript", ["-l", "JavaScript", "-e", script], {
    stdio: "inherit",
    detached: true,
  });
  child.unref();
  return child;
}

// ── Windows Tray (PowerShell + Windows.Forms) ──────────────

function createWindowsTray() {
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Text = "StableClaw Gateway"
$notify.Visible = $true
$notify.BalloonTipText = "StableClaw Gateway is running"
$notify.ShowBalloonTip(3000)

$context = New-Object System.Windows.Forms.ContextMenuStrip

$start = $context.Items.Add("▶ Start Service")
$start.Add_Click({
    Start-Process -FilePath "${BIN}" -ArgumentList "daemon","start" -WindowStyle Hidden
})

$stop = $context.Items.Add("⏹ Stop Service")
$stop.Add_Click({
    Start-Process -FilePath "${BIN}" -ArgumentList "daemon","stop" -WindowStyle Hidden
})

$context.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$dash = $context.Items.Add("🌐 Open Dashboard")
$dash.Add_Click({
    Start-Process "http://localhost:18789"
})

$onboard = $context.Items.Add("📋 Onboard")
$onboard.Add_Click({
    Start-Process "http://localhost:18789/onboard"
})

$context.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$exit = $context.Items.Add("❌ Exit")
$exit.Add_Click({
    $notify.Visible = $false
    $notify.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $context
[System.Windows.Forms.Application]::Run()

$notify.Dispose()
`;
  const scriptPath = writeTempScript(psScript, ".ps1");

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-WindowStyle",
    "Hidden",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  return child;
}

// ── Linux Tray (python3-gi / Gtk) ─────────────────────────

function createLinuxTray() {
  const pythonScript = `
import subprocess
import sys
import os
import signal
import json
import tempfile

try:
    from gi.repository import Gtk, GdkPixbuf, GLib
    try:
        from gi.repository import AppIndicator3
        HAS_INDICATOR = True
    except ImportError:
        HAS_INDICATOR = False
except ImportError:
    HAS_INDICATOR = False
    Gtk = None

BIN = "${BIN}"

def run_daemon(action):
    try:
        result = subprocess.run(
            [BIN, "daemon", action, "--json"],
            capture_output=True, text=True, timeout=30
        )
        return result.returncode == 0
    except Exception:
        return False

def open_url(url):
    try:
        subprocess.Popen(
            ["xdg-open", url],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
    except Exception:
        pass

def get_status_text():
    try:
        result = subprocess.run(
            [BIN, "daemon", "status", "--json"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        running = data.get("running", data.get("state", {}).get("running", None))
        if running:
            return "StableClaw: Running"
        return "StableClaw: Stopped"
    except Exception:
        return "StableClaw: Unknown"

def on_start(item):
    run_daemon("start")

def on_stop(item):
    run_daemon("stop")

def on_dashboard(item):
    open_url("http://localhost:18789")

def on_onboard(item):
    open_url("http://localhost:18789/onboard")

def on_exit(item):
    Gtk.main_quit()
    sys.exit(0)

def create_icon_pixbuf():
    """Create a simple icon programmatically using GdkPixbuf (no cairo needed)."""
    import struct

    width, height = 32, 32
    rowstride = width * 4
    # BGRA pixel data (premultiplied alpha)
    pixels = bytearray(width * height * 4)

    for y in range(height):
        for x in range(width):
            idx = (y * width + x) * 4
            dx = x - 16
            dy = y - 16
            dist_sq = dx * dx + dy * dy
            radius_sq = 14 * 14

            if dist_sq <= radius_sq:
                # Inside circle: blue (#3366FF) with alpha
                pixels[idx]     = 0xFF  # B
                pixels[idx + 1] = 0x66  # G
                pixels[idx + 2] = 0x33  # R
                pixels[idx + 3] = 0xFF  # A

    raw_data = bytes(pixels)
    return GdkPixbuf.Pixbuf.new_from_data(
        raw_data,
        GdkPixbuf.Colorspace.RGB,
        True,   # has alpha
        8,      # bits per sample
        width,
        height,
        rowstride
    )

def save_icon_to_cache(pixbuf):
    """Save pixbuf to a cache file for AppIndicator."""
    cache_dir = os.path.join(
        os.environ.get("HOME", tempfile.gettempdir()),
        ".cache", "stableclaw-tray"
    )
    os.makedirs(cache_dir, exist_ok=True)
    icon_path = os.path.join(cache_dir, "tray-icon.png")
    try:
        pixbuf.savev(icon_path, "png", [], [])
    except Exception:
        icon_path = None
    return icon_path

def main():
    if not Gtk:
        print("ERROR: GTK not available. Install gir1.2-gtk-3.0 or python3-gi.", file=sys.stderr)
        sys.exit(1)

    indicator = None
    statuswin = None
    pixbuf = None

    # Create icon (try without cairo first)
    try:
        pixbuf = create_icon_pixbuf()
    except Exception:
        pixbuf = None

    if HAS_INDICATOR:
        indicator = AppIndicator3.Indicator.new(
            "stableclaw-tray",
            "",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS
        )
        indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        indicator.set_attention_icon("")

        if pixbuf:
            icon_path = save_icon_to_cache(pixbuf)
            if icon_path:
                indicator.set_icon_full(icon_path, "StableClaw")

        indicator.set_label("StableClaw", "StableClaw")

    menu = Gtk.Menu()

    start_item = Gtk.MenuItem(label="▶ Start Service")
    start_item.connect("activate", on_start)
    menu.append(start_item)

    stop_item = Gtk.MenuItem(label="⏹ Stop Service")
    stop_item.connect("activate", on_stop)
    menu.append(stop_item)

    menu.append(Gtk.SeparatorMenuItem())

    dash_item = Gtk.MenuItem(label="🌐 Open Dashboard")
    dash_item.connect("activate", on_dashboard)
    menu.append(dash_item)

    onboard_item = Gtk.MenuItem(label="📋 Onboard")
    onboard_item.connect("activate", on_onboard)
    menu.append(onboard_item)

    menu.append(Gtk.SeparatorMenuItem())

    exit_item = Gtk.MenuItem(label="❌ Exit")
    exit_item.connect("activate", on_exit)
    menu.append(exit_item)

    menu.show_all()

    if indicator:
        indicator.set_menu(menu)
    else:
        # Fallback: StatusIcon (deprecated but widely available)
        statuswin = Gtk.StatusIcon()
        statuswin.set_name("StableClaw")
        statuswin.set_tooltip_text("StableClaw Gateway")
        if pixbuf:
            statuswin.set_from_pixbuf(pixbuf)
        else:
            statuswin.set_from_stock(Gtk.STOCK_NETWORK)
        statuswin.connect(
            "popup-menu",
            lambda icon, button, time: menu.popup(None, None, None, 0, button, time)
        )

    def update_status():
        try:
            text = get_status_text()
            if indicator:
                indicator.set_label(text, "StableClaw")
            elif statuswin:
                statuswin.set_tooltip_text(text)
        except Exception:
            pass
        return True

    GLib.timeout_add_seconds(5, update_status)

    signal.signal(signal.SIGTERM, lambda s, f: (Gtk.main_quit(), sys.exit(0)))
    signal.signal(signal.SIGINT, lambda s, f: (Gtk.main_quit(), sys.exit(0)))

    Gtk.main()

if __name__ == "__main__":
    main()
`;
  const scriptPath = writeTempScript(pythonScript, ".py");

  const child = spawn("python3", [scriptPath], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env },
  });
  child.unref();
  return child;
}

// ── Main entry ────────────────────────────────────────────

function main() {
  const platform = getPlatform();

  console.log("[stableclaw] Starting system tray...");

  switch (platform) {
    case "darwin":
      createMacOSTray();
      console.log("[stableclaw] macOS menu bar icon started (SC = StableClaw)");
      console.log("[stableclaw] Use the menu to start/stop daemon or exit the tray");
      // On macOS, osascript runs in foreground, so we wait
      break;

    case "win32":
      createWindowsTray();
      console.log("[stableclaw] Windows system tray icon started");
      console.log("[stableclaw] Right-click the tray icon for options");
      break;

    case "linux":
      createLinuxTray();
      console.log("[stableclaw] Linux system tray icon started");
      console.log("[stableclaw] Right-click the tray icon for options");
      break;

    default:
      console.error(`[stableclaw] System tray not supported on ${platform}`);
      process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}

export { main as runTray };
