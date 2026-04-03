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

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { writeFileWithinRoot } from "../infra/fs-safe.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("workflow-summary");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RECENT_MESSAGE_COUNT = 15;
const MAX_SUMMARY_ENTRIES_PER_FILE = 50;
const MAX_PENDING_ENTRIES = 20;

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

export function resolveWorkflowSummaryConfig(cfg?: OpenClawConfig, workspaceDir?: string): WorkflowSummaryConfig {
  const hooksConfig = cfg?.hooks?.internal?.entries?.["workflow-summary"];
  const enabled = hooksConfig?.enabled !== false;
  const recentMessageCount =
    typeof hooksConfig?.recentMessages === "number" && hooksConfig.recentMessages > 0
      ? Math.min(hooksConfig.recentMessages, 50)
      : DEFAULT_RECENT_MESSAGE_COUNT;

  const defaultWorkspace = path.join(resolveStateDir(process.env, os.homedir()), "workspace");
  const memoryDir = path.join(workspaceDir ?? defaultWorkspace, "memory", "workflow-summaries");

  return { memoryDir, recentMessageCount, enabled };
}

// ---------------------------------------------------------------------------
// Summary generation from session messages
// ---------------------------------------------------------------------------

/**
 * Extract a structured workflow summary from recent agent messages.
 * This is a lightweight heuristic extraction — no LLM call required.
 * It scans for patterns like tool calls, file edits, and assistant conclusions.
 */
export function extractWorkflowSummaryFromMessages(params: {
  messages: AgentMessage[];
  taskLabel?: string;
  timestamp?: string;
}): WorkflowSummaryEntry {
  const { messages, taskLabel, timestamp } = params;
  const outcomes: string[] = [];
  const decisions: string[] = [];
  const pending: string[] = [];
  const importantContext: string[] = [];

  let detectedLabel = taskLabel ?? "task";

  for (const msg of messages) {
    const role = (msg as { role?: string }).role;
    const content = extractTextContent(msg);
    if (!content) continue;

    // Extract outcomes from assistant messages that contain completion indicators
    if (role === "assistant") {
      // Detect file edits
      const editMatches = content.matchAll(/(?:edited|modified|created|updated|wrote|deleted)\s+[`'"]?([^`'"\n]{3,80})[`'"]?/gi);
      for (const match of editMatches) {
        if (!outcomes.includes(match[1])) {
          outcomes.push(match[1]);
        }
      }

      // Detect commit/push
      if (/(?:commit|pushed|committed)/i.test(content)) {
        const commitMatch = content.match(/([a-f0-9]{7,12})/);
        if (commitMatch && !outcomes.includes(`commit ${commitMatch[1]}`)) {
          outcomes.push(`commit ${commitMatch[1]}`);
        }
      }

      // Detect error fixes
      if (/(?:fixed|resolved|patched)/i.test(content)) {
        const fixMatch = content.match(/(?:fixed|resolved|patched)\s+(.{5,80}?)(?:\.|,|\n|$)/i);
        if (fixMatch && !outcomes.includes(fixMatch[1].trim())) {
          outcomes.push(fixMatch[1].trim());
        }
      }

      // Detect TODO/pending items
      const todoMatches = content.matchAll(/(?:TODO|pending|待办|待处理)[:\s]*(.{5,80}?)(?:\n|$)/gi);
      for (const match of todoMatches) {
        const item = match[1].trim();
        if (item.length > 2 && pending.length < MAX_PENDING_ENTRIES && !pending.includes(item)) {
          pending.push(item);
        }
      }
    }

    // Extract user requests as task labels
    if (role === "user" && !detectedLabel) {
      const firstLine = content.split("\n")[0]?.trim();
      if (firstLine && firstLine.length > 3 && firstLine.length < 80) {
        detectedLabel = firstLine;
      }
    }
  }

  // Limit arrays
  return {
    timestamp: timestamp ?? new Date().toISOString(),
    taskLabel: detectedLabel.slice(0, 100),
    outcomes: outcomes.slice(0, 15),
    decisions: decisions.slice(0, 10),
    pending: pending.slice(0, MAX_PENDING_ENTRIES),
    importantContext: importantContext.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function summaryFilename(date: Date): string {
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = date.toISOString().split("T")[1].split(".")[0].replace(/:/g, "");
  return `${dateStr}-summary-${timeStr.slice(0, 6)}.json`;
}

export async function loadLatestWorkflowSummary(
  memoryDir: string,
): Promise<WorkflowSummaryFile | null> {
  try {
    await fs.mkdir(memoryDir, { recursive: true });
    const files = await fs.readdir(memoryDir);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    if (jsonFiles.length === 0) return null;

    // Load the most recent file
    const latestPath = path.join(memoryDir, jsonFiles[0]);
    const content = await fs.readFile(latestPath, "utf-8");
    return JSON.parse(content) as WorkflowSummaryFile;
  } catch {
    return null;
  }
}

/**
 * Load all workflow summaries for the current session, merged into one.
 */
export async function loadMergedWorkflowSummary(
  memoryDir: string,
  sessionKey?: string,
): Promise<string | null> {
  try {
    await fs.mkdir(memoryDir, { recursive: true });
    const files = await fs.readdir(memoryDir);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    if (jsonFiles.length === 0) return null;

    // Load up to 3 most recent summary files
    const recentFiles = jsonFiles.slice(0, 3);
    const allEntries: WorkflowSummaryEntry[] = [];

    for (const file of recentFiles) {
      try {
        const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
        const parsed = JSON.parse(content) as WorkflowSummaryFile;
        if (sessionKey && parsed.sessionKey && parsed.sessionKey !== sessionKey) {
          continue; // Skip summaries from other sessions
        }
        allEntries.push(...(parsed.entries ?? []));
      } catch {
        // Skip corrupted files
      }
    }

    if (allEntries.length === 0) return null;

    return formatWorkflowSummaryAsContext(allEntries);
  } catch {
    return null;
  }
}

export async function appendWorkflowSummaryEntry(params: {
  memoryDir: string;
  entry: WorkflowSummaryEntry;
  sessionKey: string;
  sessionId?: string;
}): Promise<void> {
  const { memoryDir, entry, sessionKey, sessionId } = params;

  await fs.mkdir(memoryDir, { recursive: true });

  const date = new Date(entry.timestamp);
  const filename = summaryFilename(date);
  const filePath = path.join(memoryDir, filename);

  // Try to append to today's existing file, or create a new one
  let summaryFile: WorkflowSummaryFile;
  try {
    const content = await fs.readFile(filePath, "utf-8");
    summaryFile = JSON.parse(content) as WorkflowSummaryFile;
    // Don't exceed max entries per file
    if (summaryFile.entries.length >= MAX_SUMMARY_ENTRIES_PER_FILE) {
      // Start a new file
      const newFilename = summaryFilename(new Date());
      const newFilePath = path.join(memoryDir, newFilename);
      summaryFile = {
        createdAt: new Date().toISOString(),
        sessionKey,
        sessionId,
        entries: [entry],
      };
      await writeFileWithinRoot({
        rootDir: memoryDir,
        relativePath: newFilename,
        data: JSON.stringify(summaryFile, null, 2),
        encoding: "utf-8",
      });
      return;
    }
    summaryFile.entries.push(entry);
  } catch {
    // File doesn't exist or is corrupted — create new
    summaryFile = {
      createdAt: new Date().toISOString(),
      sessionKey,
      sessionId,
      entries: [entry],
    };
  }

  await writeFileWithinRoot({
    rootDir: memoryDir,
    relativePath: filename,
    data: JSON.stringify(summaryFile, null, 2),
    encoding: "utf-8",
  });

  log.info(`Workflow summary saved: ${entry.taskLabel}`, {
    path: filePath.replace(os.homedir(), "~"),
    entryCount: summaryFile.entries.length,
  });
}

// ---------------------------------------------------------------------------
// Context formatting
// ---------------------------------------------------------------------------

/**
 * Format workflow summary entries into a compact context block
 * that can be injected into the system prompt or prependContext.
 */
export function formatWorkflowSummaryAsContext(entries: WorkflowSummaryEntry[]): string {
  if (entries.length === 0) return "";

  // Deduplicate and limit
  const uniqueEntries = entries.slice(-20); // Most recent 20 entries

  const lines: string[] = [
    "<workflow-summary>",
    "The following is a summary of work completed in previous tasks in this session:",
    "",
  ];

  for (const entry of uniqueEntries) {
    lines.push(`## ${entry.taskLabel} (${entry.timestamp.split("T")[1]?.split(".")[0] ?? "unknown"})`);

    if (entry.outcomes.length > 0) {
      lines.push("**Completed:**");
      for (const outcome of entry.outcomes.slice(0, 5)) {
        lines.push(`- ${outcome}`);
      }
    }

    if (entry.decisions.length > 0) {
      lines.push("**Decisions:**");
      for (const decision of entry.decisions.slice(0, 5)) {
        lines.push(`- ${decision}`);
      }
    }

    if (entry.pending.length > 0) {
      lines.push("**Pending:**");
      for (const item of entry.pending.slice(0, 5)) {
        lines.push(`- ${item}`);
      }
    }

    if (entry.importantContext.length > 0) {
      lines.push("**Important:**");
      for (const ctx of entry.importantContext.slice(0, 3)) {
        lines.push(`- ${ctx}`);
      }
    }

    lines.push("");
  }

  lines.push("</workflow-summary>");
  return lines.join("\n");
}

/**
 * Build a prependContext block from the workflow summary for long sessions.
 * This is designed to be injected via before_prompt_build hook.
 *
 * Returns null if no summary is available or the session is short.
 */
export async function buildWorkflowSummaryPrependContext(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  sessionKey?: string;
  messageCount: number;
  contextTokenEstimate: number;
  contextWindowTokens: number;
}): Promise<string | null> {
  const wfConfig = resolveWorkflowSummaryConfig(params.config, params.workspaceDir);
  if (!wfConfig.enabled) return null;

  // Only activate when context is getting long (>50% of window)
  const usageRatio = params.contextWindowTokens > 0
    ? params.contextTokenEstimate / params.contextWindowTokens
    : 0;

  if (usageRatio < 0.5 && params.messageCount < 20) {
    return null;
  }

  const summary = await loadMergedWorkflowSummary(wfConfig.memoryDir, params.sessionKey);
  if (!summary) return null;

  // Add a hint about recent messages being preserved
  const recentHint = params.messageCount > wfConfig.recentMessageCount
    ? `\n\nNote: The most recent ${wfConfig.recentMessageCount} messages are preserved in full above this summary.`
    : "";

  return summary + recentHint;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractTextContent(msg: AgentMessage): string | null {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) return text;
  }

  return null;
}

/**
 * Clean up old workflow summary files (keep last N days).
 */
export async function cleanupOldWorkflowSummaries(
  memoryDir: string,
  maxAgeDays: number = 7,
): Promise<number> {
  try {
    await fs.mkdir(memoryDir, { recursive: true });
    const files = await fs.readdir(memoryDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(memoryDir, file);
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch {
        // Skip files we can't stat
      }
    }

    if (removed > 0) {
      log.info(`Cleaned up ${removed} old workflow summary files`);
    }
    return removed;
  } catch {
    return 0;
  }
}
