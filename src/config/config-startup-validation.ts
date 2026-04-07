import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { CONFIG_PATH } from "./paths.js";
import { validateConfigObjectRaw } from "./validation.js";
import type { ConfigValidationIssue, OpenClawConfig } from "./types.openclaw.js";

/**
 * Startup configuration validation with automatic backup restoration.
 *
 * When the gateway starts with a config file that has errors:
 * 1. Read the current config file and validate it
 * 2. If validation fails, look for the latest valid backup (.bak, .bak.1, ..., .bak.4)
 * 3. Validate each backup until a valid one is found
 * 4. If a valid backup is found: restore it, log the error, and continue startup
 * 5. If no valid backup found: throw with clear error message and the validation issues
 * 6. Save the broken config to a .error file for inspection
 */

const log = createSubsystemLogger("config-startup");

export type StartupValidationResult =
  | {
      ok: true;
      config: OpenClawConfig;
      restored: boolean;
      /** Raw config content (the content that was ultimately used) */
      raw: string;
    }
  | {
      ok: false;
      error: string;
      issues: ConfigValidationIssue[];
      brokenConfigSavedPath?: string;
    };

const BACKUP_SUFFIXES = [".bak", ".bak.1", ".bak.2", ".bak.3", ".bak.4"];

/**
 * Validate the config file at startup and, if invalid, attempt to restore
 * from the latest valid backup.
 *
 * Call this early in gateway startup, BEFORE any other subsystem reads the
 * config. If the function returns `{ ok: false }` the caller should abort
 * startup with a user-friendly error.
 */
export async function validateConfigAndRestoreBackup(
  configPath: string = CONFIG_PATH,
): Promise<StartupValidationResult> {
  // ── 1. Does the config file exist? ────────────────────────────────
  if (!fs.existsSync(configPath)) {
    // No config file = fresh install; not an error.
    return { ok: true, config: {} as OpenClawConfig, restored: false, raw: "{}" };
  }

  // ── 2. Read & validate the on-disk config ─────────────────────────
  let rawContent: string;
  try {
    rawContent = await fs.promises.readFile(configPath, "utf-8");
  } catch (err) {
    return {
      ok: false,
      error: `Cannot read config file at ${configPath}: ${String(err)}`,
      issues: [],
    };
  }

  // Parse JSON/JSON5 — the validateConfigObjectRaw expects a JS object,
  // so we need to try JSON.parse first. The full pipeline later uses
  // parseConfigJson5, but at startup we do a lightweight check.
  let parsed: unknown;
  try {
    // Use JSON.parse for the startup check (most configs are plain JSON).
    // If that fails, we still proceed — the issue will be reported.
    parsed = JSON.parse(rawContent);
  } catch {
    // Unparseable JSON — definitely invalid. Save to .error and try backup.
    log.error(`Config file at ${configPath} contains invalid JSON`);
    const savedPath = await saveBrokenConfig(configPath, rawContent);
    const restoreResult = await tryRestoreFromBackups(configPath);
    if (!restoreResult) {
      return {
        ok: false,
        error: `Config file at ${configPath} contains invalid JSON and no valid backup was found.`,
        issues: [{ path: "<root>", message: "Invalid JSON syntax" }],
        brokenConfigSavedPath: savedPath ?? undefined,
      };
    }
    log.info(`Restored config from backup: ${restoreResult.backupPath}`);
    return {
      ok: true,
      config: restoreResult.config,
      restored: true,
      raw: restoreResult.raw,
    };
  }

  // ── 3. Validate against the Zod schema ────────────────────────────
  const validation = validateConfigObjectRaw(parsed);
  if (validation.ok) {
    return { ok: true, config: validation.config, restored: false, raw: rawContent };
  }

  // ── 4. Config is invalid — log the problem ────────────────────────
  const issueCount = validation.issues.length;
  log.error(
    `Config validation failed (${issueCount} issue${issueCount !== 1 ? "s" : ""}) at ${configPath}`,
  );
  for (const issue of validation.issues) {
    const field = issue.path || "<root>";
    log.error(`  - ${field}: ${issue.message}`);
    if (issue.suggestion) {
      log.error(`    💡 ${issue.suggestion}`);
    }
  }

  // ── 5. Save broken config for inspection ──────────────────────────
  const savedPath = await saveBrokenConfig(configPath, rawContent);

  // ── 6. Try to restore from backups ────────────────────────────────
  const restoreResult = await tryRestoreFromBackups(configPath);
  if (!restoreResult) {
    const issueLines = validation.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path || "<root>"}: ${i.message}${i.suggestion ? ` (${i.suggestion})` : ""}`)
      .join("\n");
    const hiddenCount = Math.max(0, validation.issues.length - 5);
    return {
      ok: false,
      error: [
        `Invalid configuration at ${configPath}.`,
        `No valid backup found for automatic restoration.`,
        "",
        "Validation issues:",
        issueLines,
        hiddenCount > 0 ? `  ... and ${hiddenCount} more issue(s)` : "",
        "",
        "To fix:",
        `  1. Fix the config file manually, or`,
        `  2. Restore a backup from ${configPath}.bak.* manually, or`,
        `  3. Delete the config file to start fresh.`,
      ].join("\n"),
      issues: validation.issues,
      brokenConfigSavedPath: savedPath ?? undefined,
    };
  }

  // ── 7. Backup restored successfully ───────────────────────────────
  log.info(
    `Config restored from backup: ${restoreResult.backupPath} ` +
      `(${issueCount} original issue${issueCount !== 1 ? "s" : ""} bypassed)`,
  );
  return {
    ok: true,
    config: restoreResult.config,
    restored: true,
    raw: restoreResult.raw,
  };
}

// ── Internal helpers ─────────────────────────────────────────────────

type BackupRestoreResult = {
  config: OpenClawConfig;
  raw: string;
  backupPath: string;
};

/**
 * Iterate through backup slots (.bak, .bak.1 … .bak.4) and return
 * the first one that passes full schema validation.
 */
async function tryRestoreFromBackups(configPath: string): Promise<BackupRestoreResult | null> {
  for (const suffix of BACKUP_SUFFIXES) {
    const candidate = `${configPath}${suffix}`;
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      const content = await fs.promises.readFile(candidate, "utf-8");
      const parsed = JSON.parse(content);
      const result = validateConfigObjectRaw(parsed);

      if (!result.ok) {
        log.warn(
          `Backup ${candidate} rejected: ${result.issues.map((i) => i.message).join(", ")}`,
        );
        continue;
      }

      // Valid backup found — write it to the main config path.
      const tempPath = `${configPath}.restore-tmp`;
      await fs.promises.writeFile(tempPath, content, "utf-8");
      await fs.promises.rename(tempPath, configPath);

      return { config: result.config, raw: content, backupPath: candidate };
    } catch {
      // Unreadable / unparseable — skip to the next candidate.
      continue;
    }
  }

  return null;
}

/**
 * Persist the broken config to `<configPath>.error` for later inspection.
 * Returns the saved path, or null on failure.
 */
async function saveBrokenConfig(
  configPath: string,
  rawContent: string,
): Promise<string | null> {
  const errorPath = `${configPath}.error`;
  try {
    await fs.promises.writeFile(errorPath, rawContent, "utf-8");
    try {
      await fs.promises.chmod(errorPath, 0o600);
    } catch {
      // best-effort
    }
    log.info(`Broken config saved for inspection: ${errorPath}`);
    return errorPath;
  } catch (err) {
    log.warn(`Failed to save broken config: ${String(err)}`);
    return null;
  }
}
