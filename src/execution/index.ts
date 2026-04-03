/**
 * StableClaw Enhanced Execution Engine
 *
 * Public API for the execution enhancement modules:
 * - Streaming execution monitor (real-time progress)
 * - Checkpoint system (durable state snapshots for recovery)
 * - Resilience layer (retry, timeout, stall detection)
 *
 * These modules integrate into the existing agent execution pipeline
 * without modifying the channel, plugin, or skill subsystems.
 */

// Re-export types
export type {
  ExecutionPhase,
  ExecutionEventSeverity,
  ExecutionProgressEvent,
  ExecutionSnapshot,
  ExecutionCheckpoint,
  ResumeContext,
  RetryPolicy,
  ExecutionTimeoutConfig,
  ExecutionTelemetryRecord,
  ExecutionSubscriber,
  UnsubscribeFn,
} from "./types.js";

export {
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_CONFIG,
} from "./types.js";

// Monitor
export { ExecutionMonitor, getExecutionMonitor, resetExecutionMonitorForTest } from "./monitor.js";

// Checkpoint
export { CheckpointStore, getCheckpointStore, resetCheckpointStoreForTest } from "./checkpoint.js";

// Resilience
export {
  withRetry,
  withTimeout,
  createCompositeAbortController,
  createStallMonitor,
  createProgressAwareTimeout,
} from "./resilience.js";

export type {
  TimeoutResult,
  StallMonitorOptions,
} from "./resilience.js";
