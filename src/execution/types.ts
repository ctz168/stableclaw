/**
 * StableClaw Enhanced Execution Types
 *
 * Defines types for the streaming execution monitor, checkpoint system,
 * and resilience layer. These modules improve execution reliability,
 * observability, and recoverability without modifying the channel,
 * plugin, or skill subsystems.
 */

// ---------------------------------------------------------------------------
// Streaming Execution Monitor
// ---------------------------------------------------------------------------

export type ExecutionPhase =
  | "queued"
  | "initializing"
  | "prompt_composing"
  | "model_calling"
  | "tool_executing"
  | "tool_waiting"
  | "streaming_reply"
  | "compacting"
  | "delivering"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "resuming";

export type ExecutionEventSeverity = "info" | "warn" | "error";

export type ExecutionProgressEvent = {
  /** Monotonic sequence number for ordering */
  seq: number;
  /** Timestamp (ms since epoch) */
  ts: number;
  /** Unique execution identifier */
  runId: string;
  /** Current phase */
  phase: ExecutionPhase;
  /** Human-readable summary (1-2 lines) */
  summary: string;
  /** Optional detail for verbose logging */
  detail?: string;
  /** Severity level */
  severity?: ExecutionEventSeverity;
  /** Tool name when phase is tool_executing */
  toolName?: string;
  /** Tool call ID for correlation */
  toolCallId?: string;
  /** Elapsed ms since execution started */
  elapsedMs: number;
  /** Cumulative token usage (if available) */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type ExecutionSnapshot = {
  runId: string;
  sessionKey?: string;
  phase: ExecutionPhase;
  startedAt: number;
  lastEventAt: number;
  lastSummary: string;
  eventCount: number;
  errorCount: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

// ---------------------------------------------------------------------------
// Checkpoint / Resume
// ---------------------------------------------------------------------------

export type ExecutionCheckpoint = {
  /** Unique checkpoint ID */
  checkpointId: string;
  /** Run ID this checkpoint belongs to */
  runId: string;
  /** Session key for context binding */
  sessionKey?: string;
  /** Timestamp when checkpoint was created */
  createdAt: number;
  /** Current execution phase */
  phase: ExecutionPhase;
  /** Index of the last completed tool call in the conversation */
  lastCompletedToolIndex: number;
  /** Summary of progress up to this point */
  progressSummary: string;
  /** Serialized conversation context (transcript snapshot) */
  transcriptSnapshot?: string;
  /** Whether the task completed successfully */
  completed: boolean;
  /** Terminal outcome if completed */
  terminalOutcome?: "succeeded" | "blocked" | "failed" | "timed_out";
  /** Error message if failed */
  error?: string;
  /** Cumulative token usage at checkpoint time */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Config fingerprint to detect config drift */
  configHash?: string;
};

export type ResumeContext = {
  checkpoint: ExecutionCheckpoint;
  /** Messages to replay after the checkpoint */
  replayMessages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  /** Whether to skip already-completed tool calls */
  skipCompletedTools: boolean;
};

// ---------------------------------------------------------------------------
// Execution Resilience
// ---------------------------------------------------------------------------

export type RetryPolicy = {
  /** Maximum number of retry attempts (not counting the initial attempt) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Jitter factor (0-1) to avoid thundering herd */
  jitterFactor: number;
};

export type ExecutionTimeoutConfig = {
  /** Overall execution timeout (ms). 0 = no timeout */
  overallMs: number;
  /** Per-tool-call timeout (ms). 0 = no timeout */
  perToolMs: number;
  /** Per-model-call timeout (ms). 0 = no timeout */
  perModelCallMs: number;
  /** Minimum progress interval (ms). If no progress event within this
   *  window, the execution is considered stalled. 0 = disabled. */
  stallTimeoutMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  jitterFactor: 0.25,
};

export const DEFAULT_TIMEOUT_CONFIG: ExecutionTimeoutConfig = {
  overallMs: 0,
  perToolMs: 120_000,
  perModelCallMs: 60_000,
  stallTimeoutMs: 120_000,
};

// ---------------------------------------------------------------------------
// Execution Telemetry
// ---------------------------------------------------------------------------

export type ExecutionTelemetryRecord = {
  runId: string;
  sessionKey?: string;
  startedAt: number;
  endedAt?: number;
  phase: ExecutionPhase;
  outcome?: "succeeded" | "failed" | "timed_out" | "cancelled";
  totalEvents: number;
  errorCount: number;
  retryCount: number;
  checkpointCount: number;
  resumedFromCheckpoint: boolean;
  configHash?: string;
  model?: string;
  provider?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

// ---------------------------------------------------------------------------
// Subscriber Types
// ---------------------------------------------------------------------------

export type ExecutionSubscriber = {
  /** Called for every progress event */
  onEvent?: (event: ExecutionProgressEvent) => void;
  /** Called when execution reaches a terminal phase */
  onTerminal?: (snapshot: ExecutionSnapshot) => void;
  /** Called when a checkpoint is created */
  onCheckpoint?: (checkpoint: ExecutionCheckpoint) => void;
};

export type UnsubscribeFn = () => void;
