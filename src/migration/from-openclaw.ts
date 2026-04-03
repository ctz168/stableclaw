import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { OpenClawConfig } from "../config/types.js";

export type MigrationSource = "openclaw";

export type MigrationStatus = 
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed"
  | "partial";

export type MigrationResult = {
  ok: boolean;
  status: MigrationStatus;
  migratedItems: string[];
  warnings: string[];
  errors: string[];
  backupPath?: string;
};

export type MigrationOptions = {
  source: MigrationSource;
  dryRun?: boolean;
  skipPlugins?: boolean;
  skipCredentials?: boolean;
  skipLogs?: boolean;
  skipMemory?: boolean;
  skipTasks?: boolean;
  force?: boolean;
  createBackup?: boolean;
};

const OPENCLAW_DIR = ".openclaw";
const STABLECLAW_DIR = ".stableclaw";

function getOpenClawDir(): string {
  return path.join(os.homedir(), OPENCLAW_DIR);
}

function getStableClawDir(): string {
  return path.join(os.homedir(), STABLECLAW_DIR);
}

function checkOpenClawExists(): boolean {
  const openclawDir = getOpenClawDir();
  return fs.existsSync(openclawDir);
}

function checkStableClawExists(): boolean {
  const stableclawDir = getStableClawDir();
  return fs.existsSync(stableclawDir);
}

async function copyFileWithBackup(
  source: string,
  target: string,
  options: MigrationOptions
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!fs.existsSync(source)) {
      return { ok: false, error: `Source file not found: ${source}` };
    }

    // Create backup if target exists
    if (fs.existsSync(target) && options.createBackup) {
      const backupPath = `${target}.backup-${Date.now()}`;
      await fs.promises.copyFile(target, backupPath);
    }

    // Create target directory
    const targetDir = path.dirname(target);
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Copy file
    await fs.promises.copyFile(source, target);
    return { ok: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMsg };
  }
}

async function copyDirectoryWithBackup(
  source: string,
  target: string,
  options: MigrationOptions
): Promise<{ ok: boolean; error?: string; skipped?: string[] }> {
  try {
    if (!fs.existsSync(source)) {
      return { ok: false, error: `Source directory not found: ${source}` };
    }

    // Create backup if target exists
    if (fs.existsSync(target) && options.createBackup) {
      const backupPath = `${target}.backup-${Date.now()}`;
      await fs.promises.cp(source, backupPath, { recursive: true });
    }

    // Create target directory
    await fs.promises.mkdir(target, { recursive: true });

    // Copy directory contents
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    const skipped: string[] = [];

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        const result = await copyDirectoryWithBackup(sourcePath, targetPath, options);
        if (!result.ok) {
          skipped.push(entry.name);
        }
      } else if (entry.isFile()) {
        const result = await copyFileWithBackup(sourcePath, targetPath, options);
        if (!result.ok) {
          skipped.push(entry.name);
        }
      }
    }

    return { ok: true, skipped };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMsg };
  }
}

async function migrateConfig(options: MigrationOptions): Promise<{ ok: boolean; error?: string }> {
  const openclawConfig = path.join(getOpenClawDir(), "openclaw.json");
  const stableclawConfig = path.join(getStableClawDir(), "stableclaw.json");

  if (!fs.existsSync(openclawConfig)) {
    return { ok: false, error: "OpenClaw config file not found" };
  }

  if (options.dryRun) {
    console.log(`[DRY RUN] Would copy: ${openclawConfig} → ${stableclawConfig}`);
    return { ok: true };
  }

  return await copyFileWithBackup(openclawConfig, stableclawConfig, options);
}

async function migratePlugins(options: MigrationOptions): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (options.skipPlugins) {
    return { ok: true, count: 0 };
  }

  const openclawPlugins = path.join(getOpenClawDir(), "extensions");
  const stableclawPlugins = path.join(getStableClawDir(), "extensions");

  if (!fs.existsSync(openclawPlugins)) {
    return { ok: true, count: 0 };
  }

  if (options.dryRun) {
    const entries = await fs.promises.readdir(openclawPlugins, { withFileTypes: true });
    const pluginCount = entries.filter(e => e.isDirectory()).length;
    console.log(`[DRY RUN] Would copy ${pluginCount} plugins: ${openclawPlugins} → ${stableclawPlugins}`);
    return { ok: true, count: pluginCount };
  }

  const result = await copyDirectoryWithBackup(openclawPlugins, stableclawPlugins, options);
  if (result.ok) {
    const entries = await fs.promises.readdir(stableclawPlugins, { withFileTypes: true });
    const pluginCount = entries.filter(e => e.isDirectory()).length;
    return { ok: true, count: pluginCount };
  }

  return { ok: false, error: result.error };
}

async function migrateCredentials(options: MigrationOptions): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (options.skipCredentials) {
    return { ok: true, count: 0 };
  }

  const openclawCreds = path.join(getOpenClawDir(), "credentials");
  const stableclawCreds = path.join(getStableClawDir(), "credentials");

  if (!fs.existsSync(openclawCreds)) {
    return { ok: true, count: 0 };
  }

  if (options.dryRun) {
    const entries = await fs.promises.readdir(openclawCreds);
    console.log(`[DRY RUN] Would copy ${entries.length} credential files: ${openclawCreds} → ${stableclawCreds}`);
    return { ok: true, count: entries.length };
  }

  const result = await copyDirectoryWithBackup(openclawCreds, stableclawCreds, options);
  if (result.ok) {
    const entries = await fs.promises.readdir(stableclawCreds);
    return { ok: true, count: entries.length };
  }

  return { ok: false, error: result.error };
}

async function migrateDataDir(
  dirName: string,
  options: MigrationOptions,
  skip?: boolean
): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (skip) {
    return { ok: true, count: 0 };
  }

  const openclawDir = path.join(getOpenClawDir(), dirName);
  const stableclawDir = path.join(getStableClawDir(), dirName);

  if (!fs.existsSync(openclawDir)) {
    return { ok: true, count: 0 };
  }

  if (options.dryRun) {
    const entries = await fs.promises.readdir(openclawDir);
    console.log(`[DRY RUN] Would copy ${entries.length} items from ${dirName}: ${openclawDir} → ${stableclawDir}`);
    return { ok: true, count: entries.length };
  }

  const result = await copyDirectoryWithBackup(openclawDir, stableclawDir, options);
  if (result.ok) {
    const entries = await fs.promises.readdir(stableclawDir);
    return { ok: true, count: entries.length };
  }

  return { ok: false, error: result.error };
}

export async function migrateFromOpenClaw(
  options: MigrationOptions
): Promise<MigrationResult> {
  const result: MigrationResult = {
    ok: false,
    status: "not_started",
    migratedItems: [],
    warnings: [],
    errors: [],
  };

  // Check if OpenClaw exists
  if (!checkOpenClawExists()) {
    result.status = "failed";
    result.errors.push("OpenClaw installation not found. Cannot migrate.");
    return result;
  }

  // Check if StableClaw already exists
  if (checkStableClawExists() && !options.force) {
    result.status = "failed";
    result.errors.push("StableClaw already exists. Use --force to overwrite or merge.");
    result.warnings.push("Existing StableClaw installation detected.");
    return result;
  }

  result.status = "in_progress";

  // Create StableClaw directory
  if (!options.dryRun) {
    await fs.promises.mkdir(getStableClawDir(), { recursive: true });
  }

  // Migrate config
  console.log("Migrating configuration...");
  const configResult = await migrateConfig(options);
  if (configResult.ok) {
    result.migratedItems.push("config");
    console.log("✓ Configuration migrated successfully");
  } else {
    result.errors.push(`Config migration failed: ${configResult.error}`);
    console.error(`✗ Configuration migration failed: ${configResult.error}`);
  }

  // Migrate plugins
  console.log("Migrating plugins...");
  const pluginsResult = await migratePlugins(options);
  if (pluginsResult.ok) {
    if (pluginsResult.count && pluginsResult.count > 0) {
      result.migratedItems.push(`plugins (${pluginsResult.count})`);
      console.log(`✓ Migrated ${pluginsResult.count} plugins`);
    } else {
      result.warnings.push("No plugins found to migrate");
      console.log("  No plugins found to migrate");
    }
  } else {
    result.errors.push(`Plugins migration failed: ${pluginsResult.error}`);
    console.error(`✗ Plugins migration failed: ${pluginsResult.error}`);
  }

  // Migrate credentials
  console.log("Migrating credentials...");
  const credsResult = await migrateCredentials(options);
  if (credsResult.ok) {
    if (credsResult.count && credsResult.count > 0) {
      result.migratedItems.push(`credentials (${credsResult.count})`);
      console.log(`✓ Migrated ${credsResult.count} credential files`);
    } else {
      result.warnings.push("No credentials found to migrate");
      console.log("  No credentials found to migrate");
    }
  } else {
    result.errors.push(`Credentials migration failed: ${credsResult.error}`);
    console.error(`✗ Credentials migration failed: ${credsResult.error}`);
  }

  // Migrate data directories
  const dataDirs = [
    { name: "logs", skip: options.skipLogs },
    { name: "memory", skip: options.skipMemory },
    { name: "tasks", skip: options.skipTasks },
    { name: "devices", skip: false },
    { name: "agents", skip: false },
    { name: "telegram", skip: false },
    { name: "discord", skip: false },
    { name: "slack", skip: false },
    { name: "canvas", skip: false },
    { name: "workspace", skip: false },
  ];

  for (const dir of dataDirs) {
    console.log(`Migrating ${dir.name}...`);
    const dirResult = await migrateDataDir(dir.name, options, dir.skip);
    if (dirResult.ok) {
      if (dirResult.count && dirResult.count > 0) {
        result.migratedItems.push(`${dir.name} (${dirResult.count})`);
        console.log(`✓ Migrated ${dir.name} (${dirResult.count} items)`);
      }
    } else {
      result.errors.push(`${dir.name} migration failed: ${dirResult.error}`);
      console.error(`✗ ${dir.name} migration failed: ${dirResult.error}`);
    }
  }

  // Determine final status
  if (result.errors.length === 0) {
    result.ok = true;
    result.status = "completed";
    console.log("\n✅ Migration completed successfully!");
  } else if (result.migratedItems.length > 0) {
    result.ok = true;
    result.status = "partial";
    console.log("\n⚠️  Migration completed with errors");
  } else {
    result.status = "failed";
    console.log("\n❌ Migration failed");
  }

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach(e => console.error(`  - ${e}`));
  }

  return result;
}

export function getMigrationSummary(): {
  openclawExists: boolean;
  stableclawExists: boolean;
  openclawDir: string;
  stableclawDir: string;
} {
  return {
    openclawExists: checkOpenClawExists(),
    stableclawExists: checkStableClawExists(),
    openclawDir: getOpenClawDir(),
    stableclawDir: getStableClawDir(),
  };
}
