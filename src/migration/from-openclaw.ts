import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { OpenClawConfig } from "../config/types.js";

const execAsync = promisify(exec);

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
  openclawDir?: string; // Optional: manually specified OpenClaw directory
};

export type OpenClawDetectionResult = {
  isRunning: boolean;
  pid?: number;
  configDir?: string;
  executablePath?: string;
  commandLine?: string;
};

const OPENCLAW_DIR = ".openclaw";
const STABLECLAW_DIR = ".stableclaw";

/**
 * Detect running OpenClaw process
 */
async function detectRunningOpenClaw(): Promise<OpenClawDetectionResult> {
  try {
    const platform = os.platform();
    
    if (platform === "win32") {
      // Windows: use tasklist
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /V');
      const lines = stdout.split("\n").slice(1); // Skip header
      
      for (const line of lines) {
        if (line.includes("openclaw") || line.includes("stableclaw")) {
          // Parse CSV line
          const match = line.match(/"node\.exe","(\d+)"/);
          if (match) {
            const pid = parseInt(match[1]);
            
            // Try to get command line
            try {
              const { stdout: cmdline } = await execAsync(`wmic process where ProcessId=${pid} get CommandLine /format:list`);
              const cmdMatch = cmdline.match(/CommandLine=(.+)/);
              
              if (cmdMatch) {
                const cmdLine = cmdMatch[1].trim();
                
                // Extract config directory from command line or working directory
                const configDirMatch = cmdLine.match(/--config-dir[= ]([^\s]+)/);
                const homeDir = path.join(os.homedir(), OPENCLAW_DIR);
                
                return {
                  isRunning: true,
                  pid,
                  configDir: configDirMatch ? configDirMatch[1] : homeDir,
                  commandLine: cmdLine,
                };
              }
            } catch {
              // If we can't get command line, just return PID
              return {
                isRunning: true,
                pid,
                configDir: path.join(os.homedir(), OPENCLAW_DIR),
              };
            }
          }
        }
      }
    } else {
      // Linux/macOS: use ps
      const { stdout } = await execAsync('ps aux | grep -E "openclaw|stableclaw" | grep -v grep');
      const lines = stdout.split("\n").filter(l => l.trim());
      
      for (const line of lines) {
        // Parse ps output
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1]);
        const cmdLine = parts.slice(10).join(" ");
        
        // Extract config directory from command line
        const configDirMatch = cmdLine.match(/--config-dir[= ]([^\s]+)/);
        const homeDir = path.join(os.homedir(), OPENCLAW_DIR);
        
        return {
          isRunning: true,
          pid,
          configDir: configDirMatch ? configDirMatch[1] : homeDir,
          commandLine: cmdLine,
        };
      }
    }
    
    return { isRunning: false };
  } catch (error) {
    // No running process found or command failed
    return { isRunning: false };
  }
}

/**
 * Auto-detect OpenClaw configuration directory
 */
async function autoDetectOpenClawDir(): Promise<string | null> {
  // 1. Check environment variable
  const envDir = process.env.OPENCLAW_CONFIG_DIR;
  if (envDir && fs.existsSync(envDir)) {
    return envDir;
  }
  
  // 2. Check if OpenClaw is running and extract from process
  const detection = await detectRunningOpenClaw();
  if (detection.isRunning && detection.configDir && fs.existsSync(detection.configDir)) {
    return detection.configDir;
  }
  
  // 3. Check default locations
  const defaultDir = path.join(os.homedir(), OPENCLAW_DIR);
  if (fs.existsSync(defaultDir)) {
    return defaultDir;
  }
  
  // 4. Check alternative locations
  const altDirs = [
    path.join(os.homedir(), ".config", "openclaw"),
    path.join(os.homedir(), "AppData", "Roaming", "openclaw"), // Windows
    path.join(os.homedir(), "Library", "Application Support", "openclaw"), // macOS
  ];
  
  for (const dir of altDirs) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  
  return null;
}

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

    // Delete target if exists (no backup)
    if (fs.existsSync(target)) {
      await fs.promises.unlink(target);
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

    // Delete target directory if exists (no backup)
    if (fs.existsSync(target)) {
      await fs.promises.rm(target, { recursive: true, force: true });
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

  // Step 1: Detect OpenClaw installation
  console.log("\n🔍 Step 1: Detecting OpenClaw installation...\n");
  
  let openclawDir: string | null = options.openclawDir || null;
  
  // Check if OpenClaw is running
  const detection = await detectRunningOpenClaw();
  if (detection.isRunning) {
    console.log(`✓ OpenClaw is running (PID: ${detection.pid})`);
    if (detection.configDir) {
      console.log(`✓ Found config directory: ${detection.configDir}`);
      openclawDir = detection.configDir;
    }
  } else {
    console.log("ℹ OpenClaw is not running");
  }
  
  // Auto-detect if not found from running process
  if (!openclawDir) {
    console.log("\n🔍 Searching for OpenClaw configuration directory...");
    openclawDir = await autoDetectOpenClawDir();
    
    if (openclawDir) {
      console.log(`✓ Found OpenClaw directory: ${openclawDir}`);
    } else {
      console.log("✗ OpenClaw configuration directory not found");
      console.log("\n💡 Suggestion: Please start OpenClaw first, or manually specify:");
      console.log("   stableclaw migrate from-openclaw --openclaw-dir <path>");
      result.status = "failed";
      result.errors.push("OpenClaw configuration directory not found.");
      result.errors.push("Please start OpenClaw first or use --openclaw-dir option.");
      return result;
    }
  }
  
  // Verify OpenClaw directory exists
  if (!fs.existsSync(openclawDir)) {
    result.status = "failed";
    result.errors.push(`OpenClaw directory does not exist: ${openclawDir}`);
    return result;
  }
  
  // Store detected OpenClaw directory
  const detectedOpenClawDir = openclawDir;
  
  // Step 2: Check StableClaw
  console.log("\n🔍 Step 2: Checking StableClaw status...\n");
  
  const stableclawDir = getStableClawDir();
  const stableclawExists = checkStableClawExists();
  
  console.log(`StableClaw directory: ${stableclawDir}`);
  console.log(`StableClaw exists: ${stableclawExists ? "✓ Yes" : "✗ No"}`);
  
  if (stableclawExists && !options.force) {
    result.status = "failed";
    result.errors.push("StableClaw already exists. Use --force to overwrite or merge.");
    result.warnings.push("Existing StableClaw installation detected.");
    console.log("\n⚠️  StableClaw already exists. Use --force to overwrite.");
    return result;
  }

  result.status = "in_progress";
  
  // Step 3: Perform migration
  console.log("\n📦 Step 3: Starting migration...\n");

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
  const openclawConfig = path.join(detectedOpenClawDir, "openclaw.json");
  const stableclawConfig = path.join(stableclawDir, "stableclaw.json");
  
  if (!fs.existsSync(openclawConfig)) {
    result.errors.push("OpenClaw config file not found");
    console.error("✗ OpenClaw config file not found");
  } else {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would copy: ${openclawConfig} → ${stableclawConfig}`);
    } else {
      const configResult = await copyFileWithBackup(openclawConfig, stableclawConfig, options);
      if (configResult.ok) {
        result.migratedItems.push("config");
        console.log("✓ Configuration migrated successfully");
      } else {
        result.errors.push(`Config migration failed: ${configResult.error}`);
        console.error(`✗ Configuration migration failed: ${configResult.error}`);
      }
    }
  }

  // Migrate plugins
  console.log("Migrating plugins...");
  if (!options.skipPlugins) {
    const openclawPlugins = path.join(detectedOpenClawDir, "extensions");
    const stableclawPlugins = path.join(stableclawDir, "extensions");
    
    if (fs.existsSync(openclawPlugins)) {
      if (options.dryRun) {
        const entries = await fs.promises.readdir(openclawPlugins, { withFileTypes: true });
        const pluginCount = entries.filter(e => e.isDirectory()).length;
        console.log(`[DRY RUN] Would copy ${pluginCount} plugins: ${openclawPlugins} → ${stableclawPlugins}`);
        result.migratedItems.push(`plugins (${pluginCount})`);
      } else {
        const pluginsResult = await copyDirectoryWithBackup(openclawPlugins, stableclawPlugins, options);
        if (pluginsResult.ok) {
          const entries = await fs.promises.readdir(stableclawPlugins, { withFileTypes: true });
          const pluginCount = entries.filter(e => e.isDirectory()).length;
          result.migratedItems.push(`plugins (${pluginCount})`);
          console.log(`✓ Migrated ${pluginCount} plugins`);
        } else {
          result.errors.push(`Plugins migration failed: ${pluginsResult.error}`);
          console.error(`✗ Plugins migration failed: ${pluginsResult.error}`);
        }
      }
    } else {
      result.warnings.push("No plugins found to migrate");
      console.log("  No plugins found to migrate");
    }
  } else {
    console.log("  Skipping plugins migration");
  }

  // Migrate credentials
  console.log("Migrating credentials...");
  if (!options.skipCredentials) {
    const openclawCreds = path.join(detectedOpenClawDir, "credentials");
    const stableclawCreds = path.join(stableclawDir, "credentials");
    
    if (fs.existsSync(openclawCreds)) {
      if (options.dryRun) {
        const entries = await fs.promises.readdir(openclawCreds);
        console.log(`[DRY RUN] Would copy ${entries.length} credential files: ${openclawCreds} → ${stableclawCreds}`);
        result.migratedItems.push(`credentials (${entries.length})`);
      } else {
        const credsResult = await copyDirectoryWithBackup(openclawCreds, stableclawCreds, options);
        if (credsResult.ok) {
          const entries = await fs.promises.readdir(stableclawCreds);
          result.migratedItems.push(`credentials (${entries.length})`);
          console.log(`✓ Migrated ${entries.length} credential files`);
        } else {
          result.errors.push(`Credentials migration failed: ${credsResult.error}`);
          console.error(`✗ Credentials migration failed: ${credsResult.error}`);
        }
      }
    } else {
      result.warnings.push("No credentials found to migrate");
      console.log("  No credentials found to migrate");
    }
  } else {
    console.log("  Skipping credentials migration");
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
    // Important: identity, backups, weixin
    { name: "identity", skip: false },
    { name: "backups", skip: false },
    { name: "openclaw-weixin", skip: false },
    { name: "delivery-queue", skip: false },
    { name: "completions", skip: false },
  ];

  for (const dir of dataDirs) {
    if (dir.skip) {
      console.log(`Skipping ${dir.name}...`);
      continue;
    }
    
    console.log(`Migrating ${dir.name}...`);
    const openclawDataDir = path.join(detectedOpenClawDir, dir.name);
    const stableclawDataDir = path.join(stableclawDir, dir.name);
    
    if (!fs.existsSync(openclawDataDir)) {
      continue;
    }
    
    if (options.dryRun) {
      const entries = await fs.promises.readdir(openclawDataDir);
      console.log(`[DRY RUN] Would copy ${entries.length} items from ${dir.name}: ${openclawDataDir} → ${stableclawDataDir}`);
      result.migratedItems.push(`${dir.name} (${entries.length})`);
    } else {
      const dirResult = await copyDirectoryWithBackup(openclawDataDir, stableclawDataDir, options);
      if (dirResult.ok) {
        const entries = await fs.promises.readdir(stableclawDataDir);
        result.migratedItems.push(`${dir.name} (${entries.length})`);
        console.log(`✓ Migrated ${dir.name} (${entries.length} items)`);
      } else {
        result.errors.push(`${dir.name} migration failed: ${dirResult.error}`);
        console.error(`✗ ${dir.name} migration failed: ${dirResult.error}`);
      }
    }
  }

  // Migrate important files
  const importantFiles = [
    { src: "exec-approvals.json", dest: "exec-approvals.json" },
  ];

  for (const file of importantFiles) {
    const srcFile = path.join(detectedOpenClawDir, file.src);
    const destFile = path.join(stableclawDir, file.dest);
    
    if (!fs.existsSync(srcFile)) {
      continue;
    }
    
    console.log(`Migrating ${file.src}...`);
    
    if (options.dryRun) {
      console.log(`[DRY RUN] Would copy: ${srcFile} → ${destFile}`);
      result.migratedItems.push(file.src);
    } else {
      const fileResult = await copyFileWithBackup(srcFile, destFile, options);
      if (fileResult.ok) {
        result.migratedItems.push(file.src);
        console.log(`✓ Migrated ${file.src}`);
      } else {
        result.errors.push(`${file.src} migration failed: ${fileResult.error}`);
        console.error(`✗ ${file.src} migration failed: ${fileResult.error}`);
      }
    }
  }

  // Determine final status
  console.log("\n" + "=".repeat(50));
  console.log("Migration Summary");
  console.log("=".repeat(50));
  console.log(`Source:           ${detectedOpenClawDir}`);
  console.log(`Target:           ${stableclawDir}`);
  console.log(`Status:           ${result.errors.length === 0 ? "✅ Completed" : result.migratedItems.length > 0 ? "⚠️  Partial" : "❌ Failed"}`);
  console.log(`Migrated Items:   ${result.migratedItems.join(", ") || "None"}`);
  
  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach(e => console.error(`  - ${e}`));
    result.status = result.migratedItems.length > 0 ? "partial" : "failed";
  } else {
    result.ok = true;
    result.status = "completed";
    console.log("\n✅ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("  1. Run 'stableclaw config get' to verify configuration");
    console.log("  2. Run 'stableclaw plugins list' to verify plugins");
    console.log("  3. Run 'stableclaw gateway run' to start using StableClaw");
  }

  return result;
}

export async function getMigrationSummary(): Promise<{
  openclawExists: boolean;
  stableclawExists: boolean;
  openclawDir: string | null;
  stableclawDir: string;
  openclawRunning: boolean;
  openclawPid?: number;
}> {
  const detection = await detectRunningOpenClaw();
  const openclawDir = await autoDetectOpenClawDir();
  
  return {
    openclawExists: openclawDir !== null,
    stableclawExists: checkStableClawExists(),
    openclawDir,
    stableclawDir: getStableClawDir(),
    openclawRunning: detection.isRunning,
    openclawPid: detection.pid,
  };
}
