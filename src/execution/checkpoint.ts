/**
 * StableClaw Task Checkpoint System
 *
 * Provides durable execution state snapshots that enable recovery
 * from interrupted or failed executions. Inspired by Claude Code's
 * conversation checkpoint model.
 *
 * Key features:
 * - Automatic checkpointing at key execution phases
 * - Persistent storage to disk for crash recovery
 * - Config fingerprinting to detect drift between checkpoint and resume
 * - Automatic cleanup of stale checkpoints
 * - Resume API that reconstructs execution context from checkpoint
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  ExecutionCheckpoint,
  ExecutionPhase,
  ExecutionTelemetryRecord,
  ResumeContext,
} from "./types.js";

const log = createSubsystemLogger("execution/checkpoint");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CHECKPOINTS_PER_RUN = 10;
const MAX_CHECKPOINT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_TOTAL_CHECKPOINTS = 200;

// ---------------------------------------------------------------------------
// Checkpoint Store
// ---------------------------------------------------------------------------

export class CheckpointStore {
  private checkpoints = new Map<string, ExecutionCheckpoint[]>();

  constructor() {
    // Load persisted checkpoints on init
    this.loadFromDisk();
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Create a new checkpoint for a run.
   */
  createCheckpoint(params: {
    runId: string;
    sessionKey?: string;
    phase: ExecutionPhase;
    lastCompletedToolIndex: number;
    progressSummary: string;
    transcriptSnapshot?: string;
    completed: boolean;
    terminalOutcome?: "succeeded" | "blocked" | "failed" | "timed_out";
    error?: string;
    tokenUsage?: { inputTokens: number; outputTokens: number };
    configHash?: string;
  }): ExecutionCheckpoint {
    const checkpoint: ExecutionCheckpoint = {
      checkpointId: crypto.randomUUID(),
      runId: params.runId,
      sessionKey: params.sessionKey,
      createdAt: Date.now(),
      phase: params.phase,
      lastCompletedToolIndex: params.lastCompletedToolIndex,
      progressSummary: params.progressSummary,
      transcriptSnapshot: params.transcriptSnapshot,
      completed: params.completed,
      terminalOutcome: params.terminalOutcome,
      error: params.error,
      tokenUsage: params.tokenUsage,
      configHash: params.configHash,
    };

    let runCheckpoints = this.checkpoints.get(params.runId);
    if (!runCheckpoints) {
      runCheckpoints = [];
      this.checkpoints.set(params.runId, runCheckpoints);
    }

    runCheckpoints.push(checkpoint);

    // Enforce per-run limit (keep most recent)
    if (runCheckpoints.length > MAX_CHECKPOINTS_PER_RUN) {
      runCheckpoints.splice(0, runCheckpoints.length - MAX_CHECKPOINTS_PER_RUN);
    }

    // Enforce global limit
    this.enforceGlobalLimit();

    // Persist to disk
    this.persistToDisk();

    log.info(
      `Checkpoint created: runId=${params.runId}, ` +
        `phase=${params.phase}, ` +
        `toolIndex=${params.lastCompletedToolIndex}`,
    );

    return checkpoint;
  }

  /**
   * Get the latest checkpoint for a run.
   */
  getLatestCheckpoint(runId: string): ExecutionCheckpoint | undefined {
    const runCheckpoints = this.checkpoints.get(runId);
    if (!runCheckpoints || runCheckpoints.length === 0) {
      return undefined;
    }
    return runCheckpoints[runCheckpoints.length - 1];
  }

  /**
   * Get the latest non-terminal checkpoint (for resume).
   * Skips completed/failed checkpoints to find the last good state.
   */
  getLatestResumableCheckpoint(runId: string): ExecutionCheckpoint | undefined {
    const runCheckpoints = this.checkpoints.get(runId);
    if (!runCheckpoints) {
      return undefined;
    }
    // Search backwards for the latest incomplete checkpoint
    for (let i = runCheckpoints.length - 1; i >= 0; i--) {
      const cp = runCheckpoints[i];
      if (!cp.completed && cp.phase !== "failed" && cp.phase !== "timed_out") {
        return cp;
      }
    }
    return undefined;
  }

  /**
   * Build a resume context from a checkpoint.
   */
  buildResumeContext(checkpoint: ExecutionCheckpoint): ResumeContext {
    return {
      checkpoint,
      skipCompletedTools: true,
    };
  }

  /**
   * List all runs that have checkpoints.
   */
  listRunWithCheckpoints(): Array<{
    runId: string;
    sessionKey?: string;
    checkpointCount: number;
    latestPhase: ExecutionPhase;
    latestCreatedAt: number;
    completed: boolean;
  }> {
    const result: Array<{
      runId: string;
      sessionKey?: string;
      checkpointCount: number;
      latestPhase: ExecutionPhase;
      latestCreatedAt: number;
      completed: boolean;
    }> = [];

    for (const [runId, checkpoints] of this.checkpoints) {
      const latest = checkpoints[checkpoints.length - 1];
      if (!latest) continue;
      result.push({
        runId,
        sessionKey: latest.sessionKey,
        checkpointCount: checkpoints.length,
        latestPhase: latest.phase,
        latestCreatedAt: latest.createdAt,
        completed: latest.completed,
      });
    }

    return result.sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
  }

  /**
   * Clean up stale checkpoints.
   */
  cleanupStaleCheckpoints(): number {
    const now = Date.now();
    let removed = 0;

    for (const [runId, checkpoints] of this.checkpoints) {
      const before = checkpoints.length;
      const filtered = checkpoints.filter(
        (cp) => now - cp.createdAt < MAX_CHECKPOINT_AGE_MS,
      );

      if (filtered.length < before) {
        this.checkpoints.set(runId, filtered);
        removed += before - filtered.length;
      }

      // Remove empty run entries
      if (filtered.length === 0) {
        this.checkpoints.delete(runId);
      }
    }

    if (removed > 0) {
      this.persistToDisk();
      log.info(`Cleaned up ${removed} stale checkpoints`);
    }

    return removed;
  }

  /**
   * Delete all checkpoints for a run.
   */
  deleteRunCheckpoints(runId: string): void {
    this.checkpoints.delete(runId);
    this.persistToDisk();
  }

  /**
   * Record execution telemetry for analytics.
   */
  recordTelemetry(record: ExecutionTelemetryRecord): void {
    // Persist telemetry alongside checkpoints
    try {
      const telemetryPath = this.resolveTelemetryPath();
      const dir = path.dirname(telemetryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let telemetry: ExecutionTelemetryRecord[] = [];
      try {
        const raw = fs.readFileSync(telemetryPath, "utf-8");
        telemetry = JSON.parse(raw);
      } catch {
        // File doesn't exist or is corrupt; start fresh
      }

      telemetry.push(record);

      // Keep only last 1000 records
      if (telemetry.length > 1000) {
        telemetry = telemetry.slice(-1000);
      }

      fs.writeFileSync(telemetryPath, JSON.stringify(telemetry, null, 2), "utf-8");
    } catch (err) {
      log.warn(`Failed to persist telemetry: ${String(err)}`);
    }
  }

  /**
   * Get recent telemetry records.
   */
  getRecentTelemetry(limit = 50): ExecutionTelemetryRecord[] {
    try {
      const telemetryPath = this.resolveTelemetryPath();
      if (!fs.existsSync(telemetryPath)) {
        return [];
      }
      const raw = fs.readFileSync(telemetryPath, "utf-8");
      const records: ExecutionTelemetryRecord[] = JSON.parse(raw);
      return records.slice(-limit);
    } catch {
      return [];
    }
  }

  // ---- Persistence --------------------------------------------------------

  private resolveStorePath(): string {
    const stateDir =
      process.env.OPENCLAW_STATE_DIR ||
      path.join(
        process.env.HOME || process.env.USERPROFILE || "/tmp",
        ".openclaw",
        "state",
      );
    return path.join(stateDir, "execution-checkpoints.json");
  }

  private resolveTelemetryPath(): string {
    const stateDir =
      process.env.OPENCLAW_STATE_DIR ||
      path.join(
        process.env.HOME || process.env.USERPROFILE || "/tmp",
        ".openclaw",
        "state",
      );
    return path.join(stateDir, "execution-telemetry.jsonl");
  }

  private persistToDisk(): void {
    try {
      const storePath = this.resolveStorePath();
      const dir = path.dirname(storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data: Record<string, ExecutionCheckpoint[]> = {};
      for (const [runId, checkpoints] of this.checkpoints) {
        data[runId] = checkpoints;
      }

      // Atomic write
      const tmpPath = `${storePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmpPath, storePath);
    } catch (err) {
      log.warn(`Failed to persist checkpoints: ${String(err)}`);
    }
  }

  private loadFromDisk(): void {
    try {
      const storePath = this.resolveStorePath();
      if (!fs.existsSync(storePath)) {
        return;
      }

      const raw = fs.readFileSync(storePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, ExecutionCheckpoint[]>;

      for (const [runId, checkpoints] of Object.entries(data)) {
        if (Array.isArray(checkpoints)) {
          this.checkpoints.set(runId, checkpoints);
        }
      }

      log.info(`Loaded checkpoints for ${this.checkpoints.size} runs from disk`);
    } catch (err) {
      log.warn(`Failed to load checkpoints from disk: ${String(err)}`);
    }
  }

  private enforceGlobalLimit(): void {
    let total = 0;
    for (const checkpoints of this.checkpoints.values()) {
      total += checkpoints.length;
    }

    if (total <= MAX_TOTAL_CHECKPOINTS) {
      return;
    }

    // Remove oldest checkpoints across all runs
    const allCheckpoints: Array<{ runId: string; index: number; createdAt: number }> = [];
    for (const [runId, checkpoints] of this.checkpoints) {
      for (let i = 0; i < checkpoints.length; i++) {
        allCheckpoints.push({
          runId,
          index: i,
          createdAt: checkpoints[i].createdAt,
        });
      }
    }

    allCheckpoints.sort((a, b) => a.createdAt - b.createdAt);

    const toRemove = total - MAX_TOTAL_CHECKPOINTS;
    for (let i = 0; i < toRemove && i < allCheckpoints.length; i++) {
      const { runId, index } = allCheckpoints[i];
      const runCheckpoints = this.checkpoints.get(runId);
      if (runCheckpoints) {
        runCheckpoints.splice(index, 1);
        if (runCheckpoints.length === 0) {
          this.checkpoints.delete(runId);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let globalStore: CheckpointStore | undefined;

export function getCheckpointStore(): CheckpointStore {
  if (!globalStore) {
    globalStore = new CheckpointStore();
  }
  return globalStore;
}

export function resetCheckpointStoreForTest(): void {
  if (globalStore) {
    globalStore = undefined;
  }
}
