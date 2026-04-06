/**
 * Workflow Summary System
 *
 * After each agent task completion, generates a structured workflow summary
 * and persists it to memory. When context grows long, the summary is loaded
 * and injected into the prompt alongside recent messages, ensuring the agent
 * retains critical context even after compaction.
 *
 * Design goals:
 * - Proactive: summary generated after each task, not just on compaction
 * - Structured: captures tasks, decisions, pending items, important context
 * - Persistent: stored in memory/ directory, survives across sessions
 * - Composable: used by compaction to improve context quality
 */
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../config/config.js";
export type WorkflowSummaryEntry = {
    /** ISO-8601 timestamp when this summary was generated. */
    timestamp: string;
    /** Human-readable label for what was accomplished (e.g. "fix timeout config"). */
    taskLabel: string;
    /** Key outcomes / changes made. */
    outcomes: string[];
    /** Decisions made and rationale. */
    decisions: string[];
    /** Items still pending or blocked. */
    pending: string[];
    /** Free-form important context that should not be lost. */
    importantContext: string[];
};
export type WorkflowSummaryFile = {
    /** ISO-8601 timestamp of file creation. */
    createdAt: string;
    /** Session key this summary belongs to. */
    sessionKey: string;
    /** Session ID. */
    sessionId?: string;
    /** Ordered list of task summaries. */
    entries: WorkflowSummaryEntry[];
};
export type WorkflowSummaryConfig = {
    /** Directory where workflow summaries are stored. */
    memoryDir: string;
    /** Maximum number of recent messages to reference. Default 15. */
    recentMessageCount: number;
    /** Whether the workflow summary system is enabled. */
    enabled: boolean;
};
export declare function resolveWorkflowSummaryConfig(cfg?: OpenClawConfig, workspaceDir?: string): WorkflowSummaryConfig;
/**
 * Extract a structured workflow summary from recent agent messages.
 * This is a lightweight heuristic extraction — no LLM call required.
 * It scans for patterns like tool calls, file edits, and assistant conclusions.
 */
export declare function extractWorkflowSummaryFromMessages(params: {
    messages: AgentMessage[];
    taskLabel?: string;
    timestamp?: string;
}): WorkflowSummaryEntry;
export declare function loadLatestWorkflowSummary(memoryDir: string): Promise<WorkflowSummaryFile | null>;
/**
 * Load all workflow summaries for the current session, merged into one.
 */
export declare function loadMergedWorkflowSummary(memoryDir: string, sessionKey?: string): Promise<string | null>;
export declare function appendWorkflowSummaryEntry(params: {
    memoryDir: string;
    entry: WorkflowSummaryEntry;
    sessionKey: string;
    sessionId?: string;
}): Promise<void>;
/**
 * Format workflow summary entries into a compact context block
 * that can be injected into the system prompt or prependContext.
 */
export declare function formatWorkflowSummaryAsContext(entries: WorkflowSummaryEntry[]): string;
/**
 * Build a prependContext block from the workflow summary for long sessions.
 * This is designed to be injected via before_prompt_build hook.
 *
 * Returns null if no summary is available or the session is short.
 */
export declare function buildWorkflowSummaryPrependContext(params: {
    config?: OpenClawConfig;
    workspaceDir?: string;
    sessionKey?: string;
    messageCount: number;
    contextTokenEstimate: number;
    contextWindowTokens: number;
}): Promise<string | null>;
/**
 * Clean up old workflow summary files (keep last N days).
 */
export declare function cleanupOldWorkflowSummaries(memoryDir: string, maxAgeDays?: number): Promise<number>;
