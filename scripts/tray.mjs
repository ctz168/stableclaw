#!/usr/bin/env node
/**
 * StableClaw System Tray - Cross-platform system tray icon for controlling the Gateway daemon.
 *
 * Provides a system tray/menu-bar icon with context menu options to:
 *   - Start / Stop the Gateway daemon service
 *   - Open the Dashboard in a browser
 *   - Exit the tray process
 *
 * Platform implementations:
 *   - macOS:  Uses osascript + JXA (no external deps)
 *   - Windows: Uses PowerShell + System.Windows.Forms (no external deps)
 *   - Linux:  Uses zenity --notification or yad (no external deps)
 */

import { spawn, execSync, exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ── Utility helpers ──────────────────────────────────────

function getPlatform() {
  return process.platform;
}

function resolveBinPath() {
  // Try to find the stableclaw binary
  const candidates = [
    process.env._, // from npm global bin
    join(PROJECT_ROOT, process.platform === "win32" ? "stableclaw.cmd" : "stableclaw"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return "stableclaw"; // fallback to PATH
}

const BIN = resolveBinPath();

function runDaemonAction(action) {
  return new Promise((resolve) => {
    const child = spawn(BIN, ["daemon", action, "--json"], {
      stdio: "pipe",
      shell: getPlatform() === "win32",
    });
    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.on("close", () => resolve(stdout));
    child.on("error", () => resolve(""));
  });
}

function openDashboard() {
  const url = "http://localhost:18789";
  const cmd =
    getPlatform() === "darwin"
      ? "open"
      : getPlatform() === "win32"
        ? "start"
        : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
}

// ── macOS Tray (osascript + JXA) ──────────────────────────

function createMacOSTray() {
  const script = `
    ObjC.import("AppKit");

    const app = $.NSApplication.sharedApplication;
    app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);

    const statusItem = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
    statusItem.button.title = "SC";
    statusItem.button.toolTip = "StableClaw Gateway";

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

    // Separator
    menu.addItem($.NSMenuItem.separatorItem);

    // Status
    const statusItem2 = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("Status: Checking...", "checkStatus:", "");
    statusItem2.enabled = false;
    menu.addItem(statusItem2);

    // Separator
    menu.addItem($.NSMenuItem.separatorItem);

    // Exit
    const exitItem = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent$("❌ Exit", "exitApp:", "");
    menu.addItem(exitItem);

    statusItem.menu = menu;

    // Action handlers
    ObjC.registerSubclass({
      name: "TrayDelegate",
      methods: {
        "startDaemon:": function (sender) {
          $.NSTask.launchedTaskWithLaunchPathArguments("/usr/bin/env", ["node", "${BIN}", "daemon", "start"]);
          statusItem2.title = "Status: Starting...";
        },
        "stopDaemon:": function (sender) {
          $.NSTask.launchedTaskWithLaunchPathArguments("/usr/bin/env", ["node", "${BIN}", "daemon", "stop"]);
          statusItem2.title = "Status: Stopping...";
        },
        "openDashboard:": function (sender) {
          $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString("http://localhost:18789"));
        },
        "checkStatus:": function (sender) {},
        "exitApp:": function (sender) {
          $.NSApplication.sharedApplication.terminate(nil);
        },
      },
    });

    const delegate = $.TrayDelegate.alloc.init;
    app.delegate = delegate;

    // Periodic status check
    const timer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
      5.0, delegate, "checkStatus:", null, true
    );

    // Override checkStatus in delegate to actually check
    ObjC.registerSubclass({
      name: "TrayDelegate2",
      methods: {
        "checkStatus:": function (sender) {
          const task = $.NSTask.alloc.init;
          task.launchPath = "/usr/bin/env";
          task.arguments = ["node", "${BIN}", "daemon", "status", "--json"];
          const pipe = $.NSPipe.pipe;
          task.standardOutput = pipe;
          task.launch;
          // We'll read output asynchronously
        },
      },
    });

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

$icon = New-Object System.Drawing.Icon((Get-Process -Id $PID).MainModule.FileName, 16, 16)
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Text = "StableClaw Gateway"
$notify.Visible = $true
$notify.BalloonTipText = "StableClaw Gateway is running"
$notify.ShowBalloonTip(3000)

$context = New-Object System.Windows.Forms.ContextMenuStrip

$start = $context.Items.Add("Start Gateway")
$start.Add_Click({
    Start-Process -FilePath "${BIN}" -ArgumentList "daemon","start" -WindowStyle Hidden
})

$stop = $context.Items.Add("Stop Gateway")
$stop.Add_Click({
    Start-Process -FilePath "${BIN}" -ArgumentList "daemon","stop" -WindowStyle Hidden
})

$context.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$dash = $context.Items.Add("Open Dashboard")
$dash.Add_Click({
    Start-Process "http://localhost:18789"
})

$context.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$exit = $context.Items.Add("Exit")
$exit.Add_Click({
    $notify.Visible = $false
    $notify.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $context
[System.Windows.Forms.Application]::Run()

$notify.Dispose()
`;
  const scriptPath = join(PROJECT_ROOT, "scripts", ".tray-windows.ps1");
  writeFileSync(scriptPath, psScript, "utf8");

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

// ── Linux Tray (zenity / yad / python3-gi) ───────────────

function createLinuxTray() {
  // Try to use python3 with gi (Gtk/AppIndicator3)
  const pythonScript = `
import subprocess
import sys
import os
import signal
import json
import threading
import time

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

def open_dashboard():
    try:
        subprocess.Popen(["xdg-open", "http://localhost:18789"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
    open_dashboard()

def on_exit(item):
    Gtk.main_quit()
    sys.exit(0)

def create_icon():
    """Create a simple icon programmatically."""
    import cairo
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 32, 32)
    ctx = cairo.Context(surface)
    # Draw a circle
    ctx.set_source_rgb(0.2, 0.6, 1.0)
    ctx.arc(16, 16, 14, 0, 2 * 3.14159)
    ctx.fill()
    # Draw SC text
    ctx.set_source_rgb(1.0, 1.0, 1.0)
    ctx.select_font_face("sans-serif", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    ctx.set_font_size(14)
    ctx.move_to(6, 21)
    ctx.show_text("SC")
    return surface

def main():
    if not Gtk:
        print("ERROR: GTK not available. Install gir1.2-gtk-3.0 or python3-gi.", file=sys.stderr)
        sys.exit(1)

    indicator = None
    statuswin = None

    if HAS_INDICATOR:
        indicator = AppIndicator3.Indicator.new(
            "stableclaw-tray",
            "",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS
        )
        indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        indicator.set_attention_icon("")

        # Create icon
        try:
            surface = create_icon()
            pixbuf = GdkPixbuf.Pixbuf.new_from_data(
                surface.get_data(),
                GdkPixbuf.Colorspace.RGB,
                True,
                8,
                surface.get_width(),
                surface.get_height(),
                surface.get_stride()
            )
            icon_path = os.path.join(os.environ.get("HOME", "/tmp"), ".cache", "stableclaw-tray-icon.png")
            os.makedirs(os.path.dirname(icon_path), exist_ok=True)
            pixbuf.savev(icon_path, "png", [], [])
            indicator.set_icon_full(icon_path, "StableClaw")
        except Exception:
            pass

        indicator.set_label("StableClaw", "StableClaw")

    menu = Gtk.Menu()

    start_item = Gtk.MenuItem(label="▶ Start")
    start_item.connect("activate", on_start)
    menu.append(start_item)

    stop_item = Gtk.MenuItem(label="⏹ Stop")
    stop_item.connect("activate", on_stop)
    menu.append(stop_item)

    menu.append(Gtk.SeparatorMenuItem())

    dash_item = Gtk.MenuItem(label="Open Dashboard")
    dash_item.connect("activate", on_dashboard)
    menu.append(dash_item)

    menu.append(Gtk.SeparatorMenuItem())

    exit_item = Gtk.MenuItem(label="Exit")
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
        try:
            surface = create_icon()
            pixbuf = GdkPixbuf.Pixbuf.new_from_data(
                surface.get_data(),
                GdkPixbuf.Colorspace.RGB,
                True,
                8,
                surface.get_width(),
                surface.get_height(),
                surface.get_stride()
            )
            statuswin.set_from_pixbuf(pixbuf)
        except Exception:
            statuswin.set_from_stock(Gtk.STOCK_NETWORK)
        statuswin.connect("popup-menu", lambda icon, button, time: menu.popup(None, None, None, 0, button, time))

    def update_status():
        try:
            if indicator:
                indicator.set_label(get_status_text(), "StableClaw")
            elif statuswin:
                statuswin.set_tooltip_text(get_status_text())
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
  const scriptPath = join(PROJECT_ROOT, "scripts", ".tray-linux.py");
  writeFileSync(scriptPath, pythonScript, "utf8");

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
      console.log("[stableclaw] macOS menu bar icon started (StableClaw = SC)");
      console.log("[stableclaw] Close the menu item to exit the tray");
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
