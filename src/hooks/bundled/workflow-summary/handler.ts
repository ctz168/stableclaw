/**
 * Workflow Summary Hook Handler
 *
 * Listens for agent:end internal hook events and generates a structured
 * workflow summary from the session context. Persists the summary to
 * memory/workflow-summaries/ for later context injection during compaction.
 *
 * The hook uses data available in the agent:end event context:
 * - assistantTexts: accumulated assistant text outputs
 * - toolMetas: tool call metadata (name, description)
 * - isError / error: whether the run ended with an error
 */

import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../../config/config.js";
import { resolveStateDir } from "../../../config/paths.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import {
  resolveAgentIdByWorkspacePath,
  resolveAgentWorkspaceDir,
} from "../../../agents/agent-scope.js";
import type {
  WorkflowSummaryEntry,
  WorkflowSummaryConfig,
} from "../../../agents/workflow-summary.js";
import {
  resolveWorkflowSummaryConfig,
  appendWorkflowSummaryEntry,
  cleanupOldWorkflowSummaries,
} from "../../../agents/workflow-summary.js";

const log = createSubsystemLogger("hooks/workflow-summary");

/**
 * Extract a structured workflow summary from the agent:end event context.
 */
function extractSummaryFromEndContext(params: {
  context: Record<string, unknown>;
  timestamp?: string;
}): WorkflowSummaryEntry {
  const { context, timestamp } = params;
  const outcomes: string[] = [];
  const decisions: string[] = [];
  const pending: string[] = [];
  const importantContext: string[] = [];

  // Extract tool usage from toolMetas
  const toolMetas = (context.toolMetas ?? []) as Array<{
    toolName?: string;
    meta?: string;
  }>;
  for (const tm of toolMetas) {
    const name = tm.toolName ?? "unknown";
    const meta = tm.meta;
    if (meta && meta.length > 0) {
      outcomes.push(`${name}: ${meta.slice(0, 80)}`);
    } else {
      outcomes.push(`used ${name}`);
    }
  }

  // Extract outcomes from assistant texts
  const assistantTexts = (context.assistantTexts ?? []) as string[];
  const fullAssistantText = assistantTexts.join("\n");
  if (fullAssistantText.length > 0) {
    // Detect file edits/creates
    const editMatches = fullAssistantText.matchAll(
      /(?:edited|modified|created|updated|wrote|deleted|重写|修改|创建|更新)\s+[`'"]?([^`'"\n]{3,80})[`'"]?/gi,
    );
    for (const match of editMatches) {
      if (!outcomes.some((o) => o.includes(match[1]))) {
        outcomes.push(match[1]);
      }
    }

    // Detect commits
    const commitMatches = fullAssistantText.matchAll(/([a-f0-9]{7,12})/g);
    for (const match of commitMatches) {
      if (!outcomes.includes(`commit ${match[1]}`)) {
        outcomes.push(`commit ${match[1]}`);
      }
    }

    // Detect TODO/pending items
    const todoMatches = fullAssistantText.matchAll(
      /(?:TODO|pending|待办|待处理|需要.*?完成)[:\s]*(.{5,80}?)(?:\n|$)/gi,
    );
    for (const match of todoMatches) {
      const item = match[1].trim();
      if (item.length > 2 && pending.length < 20 && !pending.includes(item)) {
        pending.push(item);
      }
    }
  }

  // Generate task label from session context
  const runId = typeof context.runId === "string" ? context.runId : "";
  const isError = context.isError === true;
  const error = typeof context.error === "string" ? context.error : undefined;

  let taskLabel = isError
    ? `run ${runId.slice(0, 8)} (failed: ${error?.slice(0, 50) ?? "unknown"})`
    : `run ${runId.slice(0, 8)}`;

  // If there's a meaningful error, add it to important context
  if (error && error.length > 0) {
    importantContext.push(`Last error: ${error.slice(0, 200)}`);
  }

  return {
    timestamp: timestamp ?? new Date().toISOString(),
    taskLabel: taskLabel.slice(0, 100),
    outcomes: outcomes.slice(0, 15),
    decisions: decisions.slice(0, 10),
    pending: pending.slice(0, 20),
    importantContext: importantContext.slice(0, 10),
  };
}

/**
 * Main hook handler for agent:end events.
 */
const handleWorkflowSummary = async (event: {
  type: string;
  action: string;
  sessionKey: string;
  context?: Record<string, unknown>;
  timestamp?: Date;
}): Promise<void> => {
  // Only handle agent:end events
  if (event.type !== "agent" || event.action !== "end") {
    return;
  }

  try {
    log.debug("Workflow summary hook triggered", {
      sessionKey: event.sessionKey,
    });

    const context = event.context ?? {};
    const cfg = context.cfg as OpenClawConfig | undefined;
    const workspaceDir =
      typeof context.workspaceDir === "string" && context.workspaceDir.trim().length > 0
        ? context.workspaceDir
        : undefined;

    const resolvedWorkspace =
      workspaceDir ??
      (cfg
        ? resolveAgentWorkspaceDir(
            cfg,
            resolveAgentIdByWorkspacePath(cfg, workspaceDir ?? ""),
          )
        : path.join(resolveStateDir(process.env, os.homedir()), "workspace"));

    const wfConfig: WorkflowSummaryConfig = resolveWorkflowSummaryConfig(cfg, resolvedWorkspace);
    if (!wfConfig.enabled) {
      log.debug("Workflow summary disabled, skipping");
      return;
    }

    // Check if there's meaningful work to summarize
    const toolMetas = (context.toolMetas ?? []) as unknown[];
    const assistantTexts = (context.assistantTexts ?? []) as string[];
    const hasSubstantialContent =
      toolMetas.length > 0 ||
      assistantTexts.some((text) => text.length > 100);

    if (!hasSubstantialContent) {
      log.debug("No substantial work to summarize");
      return;
    }

    // Generate the summary from the end context
    const entry = extractSummaryFromEndContext({
      context,
      timestamp: event.timestamp?.toISOString(),
    });

    // Only save if there's meaningful content
    if (entry.outcomes.length === 0 && entry.pending.length === 0 && entry.importantContext.length === 0) {
      log.debug("No meaningful summary content extracted");
      return;
    }

    // Persist to memory
    await appendWorkflowSummaryEntry({
      memoryDir: wfConfig.memoryDir,
      entry,
      sessionKey: event.sessionKey,
      sessionId: (context.sessionId as string) || undefined,
    });

    // Periodic cleanup of old summaries (keep 7 days)
    if (Math.random() < 0.05) {
      void cleanupOldWorkflowSummaries(wfConfig.memoryDir, 7).catch(() => {});
    }

    log.info("Workflow summary generated", {
      taskLabel: entry.taskLabel,
      outcomes: entry.outcomes.length,
      pending: entry.pending.length,
      sessionKey: event.sessionKey,
    });
  } catch (err) {
    if (err instanceof Error) {
      log.error("Failed to generate workflow summary", {
        errorName: err.name,
        errorMessage: err.message,
        stack: err.stack,
      });
    } else {
      log.error("Failed to generate workflow summary", { error: String(err) });
    }
  }
};

export default handleWorkflowSummary;
