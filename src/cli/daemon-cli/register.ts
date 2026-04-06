import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { addGatewayServiceCommands } from "./register-service-commands.js";

export function registerDaemonCli(program: Command) {
  const daemon = program
    .command("daemon")
    .description("Manage the Gateway service (launchd/systemd/schtasks)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.stableclaw.ai/cli/gateway")}\n`,
    );

  addGatewayServiceCommands(daemon, {
    statusDescription: "Show service install status + probe the Gateway",
  });

  // Register the 'tray' subcommand for system tray icon
  daemon
    .command("tray")
    .description("Show system tray icon with start/stop/exit controls")
    .action(async () => {
      const { fileURLToPath } = await import("node:url");
      const { dirname, resolve } = await import("node:path");
      const trayScript = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "..",
        "scripts",
        "tray.mjs",
      );
      const { execFile } = await import("node:child_process");
      const proc = execFile(
        process.execPath,
        [trayScript],
        { stdio: "inherit" },
        (err) => {
          if (err && err.code !== null && err.code !== 0) {
            console.error("[stableclaw] Tray process exited:", err.message);
          }
        },
      );
      proc.on("spawn", () => {
        console.log(theme.success("System tray icon started."));
        console.log(
          theme.muted("Right-click the tray icon to start/stop the Gateway or exit."),
        );
      });
    });
}
