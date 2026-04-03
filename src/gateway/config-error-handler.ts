import fs from "node:fs";
import path from "node:path";
import type { ConfigFileSnapshot, ConfigValidationIssue } from "../config/types.js";
import { CONFIG_PATH } from "../config/paths.js";
import {
  markConfigInvalid,
  markConfigValid,
  markConfigRollingBack,
  getConfigStatus,
} from "../config/config-status.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { formatConfigIssueLines } from "../config/issue-format.js";

/**
 * Configuration error handler for hot reload safety.
 * 
 * This module provides:
 * - Detailed error reporting when configuration is invalid
 * - Automatic rollback to the last valid configuration
 * - Preservation of invalid configs for user inspection
 */

const configLog = createSubsystemLogger("config");

export type ConfigErrorHandlerResult = {
  /** Whether the error was handled successfully */
  handled: boolean;
  
  /** Whether a rollback was performed */
  rolledBack: boolean;
  
  /** Path to the preserved invalid config (if saved) */
  invalidConfigPath?: string;
  
  /** Error message for user display */
  errorMessage: string;
};

/**
 * Handle an invalid configuration snapshot.
 * 
 * This function:
 * 1. Logs a detailed error message
 * 2. Preserves the invalid config for user inspection
 * 3. Attempts to rollback to the last valid config
 * 4. Updates the configuration status
 */
export async function handleInvalidConfig(
  snapshot: ConfigFileSnapshot,
  options: {
    configPath?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<ConfigErrorHandlerResult> {
  const configPath = options.configPath ?? snapshot.path ?? CONFIG_PATH;
  const env = options.env ?? process.env;
  
  // Format detailed error message
  const errorMessage = formatDetailedError(snapshot);
  const shortMessage = formatShortError(snapshot);
  
  // Log the error prominently
  configLog.error(`Configuration validation failed:\n${errorMessage}`);
  
  // Preserve the invalid config for user inspection
  let invalidConfigPath: string | undefined;
  try {
    invalidConfigPath = await preserveInvalidConfig(snapshot, { configPath, env });
    if (invalidConfigPath) {
      configLog.info(`Invalid config preserved at: ${invalidConfigPath}`);
    }
  } catch (err) {
    configLog.warn(`Failed to preserve invalid config: ${String(err)}`);
  }
  
  // Update config status to invalid
  markConfigInvalid(
    {
      message: shortMessage,
      issues: snapshot.issues,
      configPath,
      invalidConfigPath,
    },
    env
  );
  
  // Attempt rollback to last valid config
  const rollbackResult = await rollbackToValidConfig({ configPath, env });
  
  if (rollbackResult.success) {
    configLog.info(`Configuration rolled back to last valid version`);
    return {
      handled: true,
      rolledBack: true,
      invalidConfigPath,
      errorMessage,
    };
  }
  
  // Rollback failed or no valid backup available
  configLog.warn(
    `No valid backup available for rollback. Gateway will continue with last known-good configuration in memory.`
  );
  
  return {
    handled: true,
    rolledBack: false,
    invalidConfigPath,
    errorMessage,
  };
}

/**
 * Format a detailed error message with all issues.
 */
function formatDetailedError(snapshot: ConfigFileSnapshot): string {
  const lines: string[] = [];
  
  lines.push("━".repeat(60));
  lines.push("CONFIGURATION VALIDATION FAILED");
  lines.push("━".repeat(60));
  lines.push("");
  
  if (snapshot.issues.length === 0) {
    lines.push("No specific validation issues reported.");
  } else {
    lines.push("Issues found:");
    lines.push("");
    for (const issue of snapshot.issues) {
      const pathLabel = issue.path || "<root>";
      const message = issue.message;
      lines.push(`  ❌ ${pathLabel}`);
      lines.push(`     ${message}`);
      
      // Add suggestion if available
      if (issue.suggestion) {
        lines.push(`     💡 ${issue.suggestion}`);
      }
      
      lines.push("");
    }
  }
  
  lines.push("━".repeat(60));
  lines.push("The invalid configuration has been preserved for inspection.");
  lines.push("The gateway will continue using the last valid configuration.");
  lines.push("━".repeat(60));
  
  return lines.join("\n");
}

/**
 * Format a short error message for status tracking.
 */
function formatShortError(snapshot: ConfigFileSnapshot): string {
  if (snapshot.issues.length === 0) {
    return "Configuration validation failed";
  }
  
  const issueCount = snapshot.issues.length;
  const firstIssue = snapshot.issues[0];
  const pathLabel = firstIssue.path || "<root>";
  
  return `Configuration validation failed (${issueCount} issue${issueCount > 1 ? "s" : ""}): ${pathLabel} - ${firstIssue.message}`;
}

/**
 * Preserve the invalid configuration for user inspection.
 * Creates a timestamped copy of the invalid config.
 */
async function preserveInvalidConfig(
  snapshot: ConfigFileSnapshot,
  options: {
    configPath: string;
    env: NodeJS.ProcessEnv;
  }
): Promise<string | undefined> {
  if (!snapshot.raw) {
    return undefined;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const invalidPath = `${options.configPath}.error-${timestamp}`;
  
  try {
    // Write the invalid config to the error file
    await fs.promises.writeFile(invalidPath, snapshot.raw, "utf-8");
    
    // Set restrictive permissions
    try {
      await fs.promises.chmod(invalidPath, 0o600);
    } catch {
      // Best-effort permission hardening
    }
    
    return invalidPath;
  } catch (err) {
    configLog.warn(`Failed to preserve invalid config: ${String(err)}`);
    return undefined;
  }
}

/**
 * Rollback to the last valid configuration.
 * 
 * This function:
 * 1. Finds the most recent valid backup
 * 2. Marks the status as "rolling_back"
 * 3. Restores the valid config
 * 4. Updates the status to "valid"
 */
async function rollbackToValidConfig(options: {
  configPath: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ success: boolean; backupPath?: string }> {
  const configPath = options.configPath;
  const env = options.env;
  
  // Find the most recent valid backup
  const backupPath = await findLatestValidBackup(configPath);
  
  if (!backupPath) {
    return { success: false };
  }
  
  // Mark as rolling back
  markConfigRollingBack("Invalid configuration detected, rolling back to last valid backup", env);
  
  try {
    // Read the backup content
    const backupContent = await fs.promises.readFile(backupPath, "utf-8");
    
    // Write it back to the main config file
    const tempPath = `${configPath}.rollback-tmp`;
    await fs.promises.writeFile(tempPath, backupContent, "utf-8");
    
    // Atomic rename
    await fs.promises.rename(tempPath, configPath);
    
    // Mark as valid
    markConfigValid({ backupPath }, env);
    
    return { success: true, backupPath };
  } catch (err) {
    configLog.error(`Rollback failed: ${String(err)}`);
    return { success: false };
  }
}

/**
 * Find the most recent valid backup file.
 * Checks openclaw.json.bak, openclaw.json.bak.1, etc.
 */
async function findLatestValidBackup(configPath: string): Promise<string | undefined> {
  const candidates = [
    `${configPath}.bak`,
    `${configPath}.bak.1`,
    `${configPath}.bak.2`,
    `${configPath}.bak.3`,
    `${configPath}.bak.4`,
  ];
  
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        // Try to parse the backup to verify it's valid
        const content = await fs.promises.readFile(candidate, "utf-8");
        JSON.parse(content); // Simple JSON validation
        return candidate;
      }
    } catch {
      // Skip invalid backup, try the next one
      continue;
    }
  }
  
  return undefined;
}

/**
 * Clear configuration error status and mark as valid.
 * Called when a new valid configuration is successfully applied.
 */
export function clearConfigError(env: NodeJS.ProcessEnv = process.env): void {
  markConfigValid({}, env);
  configLog.info("Configuration status cleared (valid)");
}

/**
 * Check if there's a pending configuration error.
 * Useful for startup warnings.
 */
export function hasConfigError(env: NodeJS.ProcessEnv = process.env): boolean {
  const status = getConfigStatus(env);
  return status.status === "invalid";
}

/**
 * Get the last configuration error details.
 */
export function getLastConfigError(
  env: NodeJS.ProcessEnv = process.env
): { message: string; issues: ConfigValidationIssue[] } | null {
  const status = getConfigStatus(env);
  
  if (status.status !== "invalid" || !status.error) {
    return null;
  }
  
  return {
    message: status.error.message,
    issues: status.error.issues,
  };
}
