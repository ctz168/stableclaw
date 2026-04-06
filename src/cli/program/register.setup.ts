import type { Command } from "commander";
import { buildGatewayInstallPlan, gatewayInstallErrorHint } from "../../commands/daemon-install-helpers.js";
import { DEFAULT_GATEWAY_DAEMON_RUNTIME } from "../../commands/daemon-runtime.js";
import { resolveGatewayInstallToken } from "../../commands/gateway-install-token.js";
import { setupWizardCommand } from "../../commands/onboard.js";
import { setupCommand } from "../../commands/setup.js";
import { readBestEffortConfig, resolveGatewayPort } from "../../config/config.js";
import { resolveGatewayService, startGatewayService } from "../../daemon/service.js";
import { isSystemdUserServiceAvailable } from "../../daemon/systemd.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { defaultRuntime } from "../../runtime.js";
import { formatCliCommand } from "../command-format.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { hasExplicitOptions } from "../command-options.js";

export function registerSetupCommand(program: Command) {
  program
    .command("setup")
    .description("Initialize the active OpenClaw config and agent workspace")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/setup", "docs.stableclaw.ai/cli/setup")}\n`,
    )
    .option(
      "--workspace <dir>",
      "Agent workspace directory (default: ~/.openclaw/workspace; stored as agents.defaults.workspace)",
    )
    .option("--wizard", "Run interactive onboarding", false)
    .option("--non-interactive", "Run onboarding without prompts", false)
    .option("--mode <mode>", "Onboard mode: local|remote")
    .option("--remote-url <url>", "Remote Gateway WebSocket URL")
    .option("--remote-token <token>", "Remote Gateway token (optional)")
    .option("--no-daemon", "Skip automatic daemon service install + start after setup")
    .action(async (opts, command) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const hasWizardFlags = hasExplicitOptions(command, [
          "wizard",
          "nonInteractive",
          "mode",
          "remoteUrl",
          "remoteToken",
        ]);
        if (opts.wizard || hasWizardFlags) {
          await setupWizardCommand(
            {
              workspace: opts.workspace as string | undefined,
              nonInteractive: Boolean(opts.nonInteractive),
              mode: opts.mode as "local" | "remote" | undefined,
              remoteUrl: opts.remoteUrl as string | undefined,
              remoteToken: opts.remoteToken as string | undefined,
            },
            defaultRuntime,
          );
          return;
        }
        await setupCommand({ workspace: opts.workspace as string | undefined }, defaultRuntime);
        // After basic setup, automatically install and start daemon service.
        // This is the default behavior; use --no-daemon to opt out.
        const skipDaemon = Boolean(opts.noDaemon);
        if (!skipDaemon) {
          await autoInstallAndStartDaemon();
        } else {
          defaultRuntime.log(
            `Daemon install skipped. Run ${formatCliCommand("openclaw gateway install")} to install manually.`,
          );
        }
      });
    });
}

const setupLog = createSubsystemLogger("setup");

/**
 * Automatically install the gateway as a daemon service and start it.
 * Called after basic `openclaw setup` completes successfully.
 * Non-fatal: logs errors but does not cause the setup command to fail.
 */
async function autoInstallAndStartDaemon() {
  try {
    // On Linux, check systemd availability before attempting install.
    if (process.platform === "linux") {
      const systemdAvailable = await isSystemdUserServiceAvailable();
      if (!systemdAvailable) {
        defaultRuntime.log(
          "Systemd user services unavailable; skipping daemon install. " +
            "Use your container supervisor or `docker compose up -d`.",
        );
        return;
      }
    }

    const service = resolveGatewayService();
    const cfg = await readBestEffortConfig();
    const port = resolveGatewayPort(cfg);

    // Check if already installed
    const loaded = await service.isLoaded({ env: process.env }).catch(() => false);
    if (loaded) {
      defaultRuntime.log(`Gateway ${service.loadedText} (already installed).`);
      // Restart to pick up the new config
      setupLog.info("restarting gateway service after setup…");
      try {
        await service.restart({ env: process.env, stdout: process.stdout });
        defaultRuntime.log("Gateway service restarted with new config.");
      } catch (err) {
        defaultRuntime.log(`Gateway service restart failed: ${String(err)}`);
      }
      return;
    }

    setupLog.info("installing gateway service…");
    const tokenResolution = await resolveGatewayInstallToken({
      config: cfg,
      env: process.env,
      autoGenerateWhenMissing: true,
      persistGeneratedToken: true,
    });
    if (tokenResolution.unavailableReason) {
      defaultRuntime.log(`Daemon install skipped: ${tokenResolution.unavailableReason}`);
      return;
    }
    for (const warning of tokenResolution.warnings) {
      defaultRuntime.log(warning);
    }

    const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
      env: process.env,
      port,
      runtime: DEFAULT_GATEWAY_DAEMON_RUNTIME,
      warn: (message) => defaultRuntime.log(message),
      config: cfg,
    });

    await service.install({
      env: process.env,
      stdout: process.stdout,
      programArguments,
      workingDirectory,
      environment,
    });
    defaultRuntime.log(`Gateway service installed (${service.label}).`);

    // Auto-start the service
    setupLog.info("starting gateway service…");
    const startResult = await startGatewayService(service, {
      env: process.env,
      stdout: process.stdout,
    });
    if (startResult.outcome === "started" || startResult.outcome === "scheduled") {
      defaultRuntime.log("Gateway service started.");
    } else {
      defaultRuntime.log(
        `Gateway service start returned: ${startResult.outcome}. ` +
          `Run ${formatCliCommand("openclaw gateway start")} manually.`,
      );
    }
  } catch (err) {
    defaultRuntime.log(`Daemon auto-install failed (non-fatal): ${String(err)}`);
    defaultRuntime.log(gatewayInstallErrorHint());
  }
}
