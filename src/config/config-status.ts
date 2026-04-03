import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "./paths.js";
import type { ConfigValidationIssue } from "./types.js";

/**
 * Configuration status tracking for hot reload safety.
 * 
 * This module manages the state of configuration changes, including:
 * - Tracking valid/invalid configuration states
 * - Persisting status for observability
 * - Supporting automatic rollback on errors
 */

export type ConfigStatusValue = "valid" | "invalid" | "rolling_back";

export type ConfigErrorStatus = {
  /** Current configuration status */
  status: ConfigStatusValue;
  
  /** Timestamp of last status change (ISO 8601) */
  timestamp: string;
  
  /** Hash of the last known valid configuration */
  lastValidHash?: string;
  
  /** Path to the last valid config backup */
  lastValidBackupPath?: string;
  
  /** Error details when status is "invalid" */
  error?: {
    /** Error message summary */
    message: string;
    
    /** Detailed validation issues */
    issues: ConfigValidationIssue[];
    
    /** Path to the invalid config backup (for user inspection) */
    invalidConfigPath?: string;
    
    /** Original config file path */
    configPath: string;
  };
  
  /** Rollback metadata when status is "rolling_back" */
  rollback?: {
    /** Timestamp when rollback started */
    startedAt: string;
    
    /** Reason for rollback */
    reason: string;
  };
};

const CONFIG_STATUS_FILENAME = "config-status.json";

/**
 * Resolve the path to the config status file.
 * Location: ~/.openclaw/state/config-status.json
 */
export function resolveConfigStatusPath(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env);
  return path.join(stateDir, CONFIG_STATUS_FILENAME);
}

/**
 * Read the current configuration status.
 * Returns a default valid status if no status file exists.
 */
export function getConfigStatus(env: NodeJS.ProcessEnv = process.env): ConfigErrorStatus {
  const statusPath = resolveConfigStatusPath(env);
  
  try {
    if (!fs.existsSync(statusPath)) {
      return createDefaultConfigStatus();
    }
    
    const raw = fs.readFileSync(statusPath, "utf-8");
    const status = JSON.parse(raw) as ConfigErrorStatus;
    
    // Validate the status structure
    if (!status.status || !status.timestamp) {
      return createDefaultConfigStatus();
    }
    
    return status;
  } catch (err) {
    // If we can't read/parse the status file, return a default valid status
    // This prevents cascading failures
    return createDefaultConfigStatus();
  }
}

/**
 * Write the configuration status to disk.
 */
export function setConfigStatus(
  status: ConfigErrorStatus,
  env: NodeJS.ProcessEnv = process.env
): void {
  const statusPath = resolveConfigStatusPath(env);
  const stateDir = path.dirname(statusPath);
  
  // Ensure the state directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  
  // Write the status file atomically
  const tempPath = `${statusPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(status, null, 2), "utf-8");
  fs.renameSync(tempPath, statusPath);
}

/**
 * Mark configuration as valid.
 */
export function markConfigValid(
  options: {
    hash?: string;
    backupPath?: string;
  } = {},
  env: NodeJS.ProcessEnv = process.env
): void {
  const current = getConfigStatus(env);
  
  setConfigStatus(
    {
      status: "valid",
      timestamp: new Date().toISOString(),
      lastValidHash: options.hash ?? current.lastValidHash,
      lastValidBackupPath: options.backupPath ?? current.lastValidBackupPath,
    },
    env
  );
}

/**
 * Mark configuration as invalid.
 */
export function markConfigInvalid(
  error: {
    message: string;
    issues: ConfigValidationIssue[];
    configPath: string;
    invalidConfigPath?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): void {
  const current = getConfigStatus(env);
  
  setConfigStatus(
    {
      status: "invalid",
      timestamp: new Date().toISOString(),
      lastValidHash: current.lastValidHash,
      lastValidBackupPath: current.lastValidBackupPath,
      error: {
        message: error.message,
        issues: error.issues,
        configPath: error.configPath,
        invalidConfigPath: error.invalidConfigPath,
      },
    },
    env
  );
}

/**
 * Mark configuration as rolling back.
 */
export function markConfigRollingBack(
  reason: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  const current = getConfigStatus(env);
  
  setConfigStatus(
    {
      status: "rolling_back",
      timestamp: new Date().toISOString(),
      lastValidHash: current.lastValidHash,
      lastValidBackupPath: current.lastValidBackupPath,
      rollback: {
        startedAt: new Date().toISOString(),
        reason,
      },
    },
    env
  );
}

/**
 * Create a default valid configuration status.
 */
function createDefaultConfigStatus(): ConfigErrorStatus {
  return {
    status: "valid",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if the last configuration was invalid (for startup warnings).
 */
export function wasLastConfigInvalid(env: NodeJS.ProcessEnv = process.env): boolean {
  const status = getConfigStatus(env);
  return status.status === "invalid";
}

/**
 * Clear the configuration error status (reset to valid).
 */
export function clearConfigStatus(env: NodeJS.ProcessEnv = process.env): void {
  setConfigStatus(createDefaultConfigStatus(), env);
}
