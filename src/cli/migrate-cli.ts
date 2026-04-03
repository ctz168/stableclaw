import type { Command } from "commander";
import {
  migrateFromOpenClaw,
  getMigrationSummary,
  type MigrationOptions,
} from "../migration/from-openclaw.js";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";

export type MigrateOptions = {
  dryRun?: boolean;
  skipPlugins?: boolean;
  skipCredentials?: boolean;
  skipLogs?: boolean;
  skipMemory?: boolean;
  skipTasks?: boolean;
  force?: boolean;
  createBackup?: boolean;
};

function formatMigrationSummary(summary: ReturnType<typeof getMigrationSummary>): string {
  const lines: string[] = [];

  lines.push(`${theme.bold("Migration Status:")}`);
  lines.push(`  OpenClaw directory:     ${summary.openclawDir}`);
  lines.push(`  OpenClaw exists:        ${summary.openclawExists ? "✓ Yes" : "✗ No"}`);
  lines.push(`  StableClaw directory:   ${summary.stableclawDir}`);
  lines.push(`  StableClaw exists:      ${summary.stableclawExists ? "✓ Yes" : "✗ No"}`);

  return lines.join("\n");
}

export function registerMigrateCli(program: Command) {
  const migrate = program
    .command("migrate")
    .description("Migrate from other OpenClaw-based projects");

  migrate
    .command("from-openclaw")
    .description("Migrate configuration, plugins, and data from OpenClaw to StableClaw")
    .option("--dry-run", "Preview migration without making changes", false)
    .option("--skip-plugins", "Skip plugin migration", false)
    .option("--skip-credentials", "Skip credentials migration", false)
    .option("--skip-logs", "Skip logs migration", false)
    .option("--skip-memory", "Skip memory migration", false)
    .option("--skip-tasks", "Skip tasks migration", false)
    .option("--force", "Force migration even if StableClaw already exists", false)
    .option("--create-backup", "Create backup of existing StableClaw data", false)
    .action(async (opts: MigrateOptions) => {
      try {
        console.log(theme.bold("\n🔄 OpenClaw → StableClaw Migration\n"));

        // Show migration summary
        const summary = getMigrationSummary();
        console.log(formatMigrationSummary(summary));
        console.log();

        // Check if OpenClaw exists
        if (!summary.openclawExists) {
          defaultRuntime.error("OpenClaw installation not found. Cannot proceed with migration.");
          defaultRuntime.exit(1);
          return;
        }

        // Check if StableClaw exists
        if (summary.stableclawExists && !opts.force) {
          defaultRuntime.error("StableClaw already exists.");
          console.log("\nUse --force to overwrite or merge existing data.");
          defaultRuntime.exit(1);
          return;
        }

        // Dry run warning
        if (opts.dryRun) {
          console.log(theme.muted("🔍 DRY RUN MODE - No changes will be made\n"));
        }

        // Confirm migration
        if (!opts.dryRun && !opts.force) {
          const { promptYesNo } = await import("./prompt.js");
          const confirmed = await promptYesNo("Proceed with migration?", false);
          if (!confirmed) {
            console.log("Migration cancelled.");
            defaultRuntime.exit(0);
            return;
          }
        }

        // Execute migration
        const migrationOptions: MigrationOptions = {
          source: "openclaw",
          dryRun: opts.dryRun,
          skipPlugins: opts.skipPlugins,
          skipCredentials: opts.skipCredentials,
          skipLogs: opts.skipLogs,
          skipMemory: opts.skipMemory,
          skipTasks: opts.skipTasks,
          force: opts.force,
          createBackup: opts.createBackup,
        };

        const result = await migrateFromOpenClaw(migrationOptions);

        // Print result
        console.log("\n" + theme.bold("Migration Summary"));
        console.log("=".repeat(50));
        console.log(`Status:           ${result.status}`);
        console.log(`Migrated Items:   ${result.migratedItems.join(", ") || "None"}`);

        if (result.warnings.length > 0) {
          console.log("\nWarnings:");
          result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
        }

        if (result.errors.length > 0) {
          console.log("\nErrors:");
          result.errors.forEach(e => console.error(`  ❌ ${e}`));
        }

        if (result.ok) {
          console.log("\n" + theme.success("✓ Migration completed successfully!"));
          console.log("\nNext steps:");
          console.log("  1. Run 'stableclaw config get' to verify configuration");
          console.log("  2. Run 'stableclaw plugins list' to verify plugins");
          console.log("  3. Run 'stableclaw gateway run' to start using StableClaw");
          defaultRuntime.exit(0);
        } else {
          console.log("\n" + theme.error("✗ Migration failed"));
          defaultRuntime.exit(1);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        defaultRuntime.error(`Migration failed: ${errorMsg}`);
        defaultRuntime.exit(1);
      }
    });

  migrate
    .command("status")
    .description("Check migration status and available sources")
    .action(() => {
      console.log(theme.bold("\n📊 Migration Status\n"));

      const summary = getMigrationSummary();
      console.log(formatMigrationSummary(summary));

      if (summary.openclawExists && !summary.stableclawExists) {
        console.log("\n" + theme.success("✓ Ready to migrate from OpenClaw"));
        console.log("\nRun: stableclaw migrate from-openclaw");
      } else if (summary.stableclawExists) {
        console.log("\n" + theme.muted("StableClaw already installed"));
        if (summary.openclawExists) {
          console.log("Use --force to re-migrate from OpenClaw");
        }
      } else {
        console.log("\n" + theme.muted("No OpenClaw installation found"));
        console.log("\nTo get started:");
        console.log("  1. Install StableClaw: npm install -g stableclaw");
        console.log("  2. Run setup: stableclaw onboard");
      }

      console.log();
    });
}
