/**
 * Task Planning Tool — Claude-style markdown checklist progress tracking.
 *
 * Provides agents with structured task decomposition and progress tracking
 * capabilities, similar to Claude's built-in task planning system.
 *
 * Features:
 * - Create/update a markdown checklist with task steps
 * - Mark individual steps as completed, in_progress, or pending
 * - Add/remove steps dynamically
 * - Get a formatted markdown progress summary
 * - Track overall task completion percentage
 *
 * The plan is stored in memory per session and can be rendered as markdown
 * for user-facing progress display.
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, ToolInputError } from "./common.js";

// ─── Types ──────────────────────────────────────────────────────────

export type TaskStepStatus = "pending" | "in_progress" | "completed" | "failed";

export type TaskStep = {
  /** Step identifier (auto-generated) */
  id: string;
  /** Step description (one-line) */
  description: string;
  /** Current status */
  status: TaskStepStatus;
  /** Priority for ordering (lower = higher priority) */
  priority: number;
  /** Optional detail/note */
  detail?: string;
  /** Timestamp when status was last changed (epoch ms) */
  updatedAt: number;
  /** Timestamp when step was created (epoch ms) */
  createdAt: number;
};

export type TaskPlan = {
  /** Plan identifier */
  id: string;
  /** Plan title */
  title: string;
  /** Description of the overall goal */
  goal?: string;
  /** Ordered steps */
  steps: TaskStep[];
  /** Timestamp when plan was created */
  createdAt: number;
  /** Timestamp when plan was last updated */
  updatedAt: number;
};

// ─── Plan Store (per-session) ──────────────────────────────────────

const planStore = new Map<string, Map<string, TaskPlan>>();

function getSessionPlans(sessionKey: string): Map<string, TaskPlan> {
  let session = planStore.get(sessionKey);
  if (!session) {
    session = new Map();
    planStore.set(sessionKey, session);
  }
  return session;
}

let stepCounter = 0;
function nextStepId(): string {
  return `step-${++stepCounter}-${Date.now().toString(36)}`;
}

let planCounter = 0;
function nextPlanId(): string {
  return `plan-${++planCounter}-${Date.now().toString(36)}`;
}

// ─── Markdown Rendering ───────────────────────────────────────────

const STATUS_ICONS: Record<TaskStepStatus, string> = {
  pending: "⬜",
  in_progress: "🔄",
  completed: "✅",
  failed: "❌",
};

function renderStepMarkdown(step: TaskStep): string {
  const icon = STATUS_ICONS[step.status] ?? "⬜";
  const desc = step.status === "completed"
    ? `~~${step.description}~~`
    : step.description;
  const detail = step.detail ? ` — _${step.detail}_` : "";
  return `${icon} ${desc}${detail}`;
}

/**
 * Render the full plan as a markdown checklist.
 * This is what gets shown to the user as progress.
 */
export function renderPlanMarkdown(plan: TaskPlan): string {
  const now = Date.now();
  const totalSteps = plan.steps.length;
  const completedSteps = plan.steps.filter((s) => s.status === "completed").length;
  const failedSteps = plan.steps.filter((s) => s.status === "failed").length;
  const inProgressSteps = plan.steps.filter((s) => s.status === "in_progress").length;
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const progressBar = totalSteps > 0
    ? `[${"█".repeat(Math.round(pct / 5))}${"░".repeat(20 - Math.round(pct / 5))}] ${pct}%`
    : "[░░░░░░░░░░░░░░░░░░░░] 0%";

  const lines: string[] = [
    `## 📋 ${plan.title}`,
    "",
  ];

  if (plan.goal) {
    lines.push(`**Goal:** ${plan.goal}`);
    lines.push("");
  }

  lines.push(`${progressBar} (${completedSteps}/${totalSteps} done`);
  if (failedSteps > 0) {
    lines.push(`⚠️ ${failedSteps} step(s) failed`);
  }
  if (inProgressSteps > 0) {
    lines.push(`🔄 ${inProgressSteps} step(s) in progress`);
  }
  lines.push("");

  if (plan.steps.length === 0) {
    lines.push("_No steps defined yet._");
  } else {
    for (const step of plan.steps) {
      lines.push(renderStepMarkdown(step));
    }
  }

  return lines.join("\n");
}

/**
 * Render a compact single-line progress summary.
 */
export function renderPlanSummary(plan: TaskPlan): string {
  const totalSteps = plan.steps.length;
  const completedSteps = plan.steps.filter((s) => s.status === "completed").length;
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  return `[${plan.title}] ${pct}% (${completedSteps}/${totalSteps})`;
}

// ─── Plan Operations ──────────────────────────────────────────────

export function getPlan(sessionKey: string, planId: string): TaskPlan | undefined {
  return getSessionPlans(sessionKey).get(planId);
}

export function getAllPlans(sessionKey: string): TaskPlan[] {
  return [...getSessionPlans(sessionKey).values()];
}

export function createPlan(params: {
  sessionKey: string;
  title: string;
  goal?: string;
  steps?: Array<{ description: string; priority?: number; detail?: string }>;
}): TaskPlan {
  const session = getSessionPlans(params.sessionKey);
  const now = Date.now();
  const planId = nextPlanId();
  const plan: TaskPlan = {
    id: planId,
    title: params.title,
    goal: params.goal,
    steps: (params.steps ?? []).map((step, index) => ({
      id: nextStepId(),
      description: step.description,
      status: "pending" as TaskStepStatus,
      priority: step.priority ?? (index + 1),
      detail: step.detail,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
  session.set(planId, plan);
  return plan;
}

export function updatePlan(params: {
  sessionKey: string;
  planId: string;
  title?: string;
  goal?: string;
}): TaskPlan | null {
  const session = getSessionPlans(params.sessionKey);
  const plan = session.get(params.planId);
  if (!plan) {
    return null;
  }
  if (params.title !== undefined) {
    plan.title = params.title;
  }
  if (params.goal !== undefined) {
    plan.goal = params.goal;
  }
  plan.updatedAt = Date.now();
  session.set(params.planId, plan);
  return plan;
}

export function deletePlan(sessionKey: string, planId: string): boolean {
  return getSessionPlans(sessionKey).delete(planId);
}

export function addStep(params: {
  sessionKey: string;
  planId: string;
  description: string;
  priority?: number;
  detail?: string;
  insertBefore?: string; // step id to insert before
  insertAfter?: string; // step id to insert after
}): TaskPlan | null {
  const session = getSessionPlans(params.sessionKey);
  const plan = session.get(params.planId);
  if (!plan) {
    return null;
  }
  const now = Date.now();
  const newStep: TaskStep = {
    id: nextStepId(),
    description: params.description,
    status: "pending",
    priority: params.priority ?? (plan.steps.length + 1),
    detail: params.detail,
    createdAt: now,
    updatedAt: now,
  };

  // Handle insertion position
  if (params.insertBefore) {
    const idx = plan.steps.findIndex((s) => s.id === params.insertBefore);
    if (idx >= 0) {
      plan.steps.splice(idx, 0, newStep);
      reindexPriorities(plan.steps);
    } else {
      plan.steps.push(newStep);
    }
  } else if (params.insertAfter) {
    const idx = plan.steps.findIndex((s) => s.id === params.insertAfter);
    if (idx >= 0) {
      plan.steps.splice(idx + 1, 0, newStep);
      reindexPriorities(plan.steps);
    } else {
      plan.steps.push(newStep);
    }
  } else {
    plan.steps.push(newStep);
  }

  plan.updatedAt = now;
  session.set(params.planId, plan);
  return plan;
}

export function updateStep(params: {
  sessionKey: string;
  planId: string;
  stepId: string;
  status?: TaskStepStatus;
  description?: string;
  detail?: string;
}): TaskPlan | null {
  const session = getSessionPlans(params.sessionKey);
  const plan = session.get(params.planId);
  if (!plan) {
    return null;
  }
  const step = plan.steps.find((s) => s.id === params.stepId);
  if (!step) {
    return null;
  }
  const now = Date.now();
  if (params.status !== undefined) {
    step.status = params.status;
  }
  if (params.description !== undefined) {
    step.description = params.description;
  }
  if (params.detail !== undefined) {
    step.detail = params.detail;
  }
  step.updatedAt = now;
  plan.updatedAt = now;
  session.set(params.planId, plan);
  return plan;
}

export function removeStep(params: {
  sessionKey: string;
  planId: string;
  stepId: string;
}): TaskPlan | null {
  const session = getSessionPlans(params.sessionKey);
  const plan = session.get(params.planId);
  if (!plan) {
    return null;
  }
  const idx = plan.steps.findIndex((s) => s.id === params.stepId);
  if (idx < 0) {
    return null;
  }
  plan.steps.splice(idx, 1);
  reindexPriorities(plan.steps);
  plan.updatedAt = Date.now();
  session.set(params.planId, plan);
  return plan;
}

export function reorderSteps(params: {
  sessionKey: string;
  planId: string;
  stepIds: string[]; // ordered array of step IDs
}): TaskPlan | null {
  const session = getSessionPlans(params.sessionKey);
  const plan = session.get(params.planId);
  if (!plan) {
    return null;
  }
  const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
  const reordered: TaskStep[] = [];
  for (const id of params.stepIds) {
    const step = stepMap.get(id);
    if (step) {
      reordered.push(step);
    }
  }
  // Append any remaining steps not in the ordered list
  for (const step of plan.steps) {
    if (!reordered.find((s) => s.id === step.id)) {
      reordered.push(step);
    }
  }
  plan.steps = reordered;
  reindexPriorities(plan.steps);
  plan.updatedAt = Date.now();
  session.set(params.planId, plan);
  return plan;
}

function reindexPriorities(steps: TaskStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    steps[i].priority = i + 1;
  }
}

/**
 * Clear all plans for a session (e.g., on session reset).
 */
export function clearSessionPlans(sessionKey: string): void {
  planStore.delete(sessionKey);
}

// ─── Tool Definitions ─────────────────────────────────────────────

/**
 * Create the task_plan tool — Claude-style task decomposition and progress tracking.
 *
 * This single tool handles all plan operations (create, update, add/remove steps,
 * mark progress) via the `action` parameter. The tool returns markdown-formatted
 * progress that can be shown to the user.
 */
export function createTaskPlanTool(opts?: {
  sessionKey?: string;
}): AnyAgentTool {
  return {
    label: "Task Planning",
    name: "task_plan",
    description: [
      "Structured task decomposition and progress tracking. Use this to:",
      "",
      "1. **Break down** a complex task into numbered steps",
      "2. **Track progress** by marking steps as completed/in_progress/failed",
      "3. **Show progress** to the user as a markdown checklist",
      "",
      "Actions:",
      "- `create` — Create a new plan with optional steps",
      "- `update` — Update plan title or goal",
      "- `add_step` — Add a step to an existing plan",
      "- `update_step` — Change step status, description, or detail",
      "- `remove_step` — Remove a step from a plan",
      "- `reorder` — Reorder steps by providing ordered step IDs",
      "- `delete` — Delete a plan",
      "- `show` — Render plan as markdown (default action)",
      "",
      "Status values: `pending`, `in_progress`, `completed`, `failed`",
      "",
      "The tool returns markdown that should be shown to the user.",
    ].join("\n"),
    parameters: Type.Object({
      action: Type.Optional(Type.String({
        description: 'Plan action: "create" | "update" | "add_step" | "update_step" | "remove_step" | "reorder" | "delete" | "show"',
      })),
      planId: Type.Optional(Type.String({ description: "Plan ID (returned by create, required for all actions except create)" })),
      title: Type.Optional(Type.String({ description: "Plan title (for create/update)" })),
      goal: Type.Optional(Type.String({ description: "Overall goal description (for create/update)" })),
      steps: Type.Optional(
        Type.Array(
          Type.Object({
            description: Type.String(),
            priority: Type.Optional(Type.Number()),
            detail: Type.Optional(Type.String()),
          }),
          { description: "Initial steps for create action" },
        ),
      ),
      stepId: Type.Optional(Type.String({ description: "Target step ID (for update_step/remove_step)" })),
      stepDescription: Type.Optional(Type.String({ description: "New step description (for add_step/update_step)" })),
      stepStatus: Type.Optional(Type.String({ description: 'New step status: "pending" | "in_progress" | "completed" | "failed"' })),
      stepDetail: Type.Optional(Type.String({ description: "Step note/detail" })),
      stepIds: Type.Optional(Type.Array(Type.String(), { description: "Ordered step IDs for reorder action" })),
      insertBefore: Type.Optional(Type.String({ description: "Insert new step before this step ID" })),
      insertAfter: Type.Optional(Type.String({ description: "Insert new step after this step ID" })),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = opts?.sessionKey ?? "default";
      const action = readStringParam(params, "action") ?? "show";
      const planId = readStringParam(params, "planId");

      switch (action) {
        case "create": {
          const title = readStringParam(params, "title", { required: true }) ?? "Untitled Plan";
          const goal = readStringParam(params, "goal");
          const steps = Array.isArray(params.steps)
            ? (params.steps as Array<{ description: string; priority?: number; detail?: string }>)
            : undefined;
          const plan = createPlan({ sessionKey, title, goal, steps });
          return jsonResult({
            planId: plan.id,
            title: plan.title,
            steps: plan.steps,
            markdown: renderPlanMarkdown(plan),
          });
        }

        case "update": {
          if (!planId) throw new ToolInputError("planId is required for update action");
          const title = readStringParam(params, "title");
          const goal = readStringParam(params, "goal");
          const plan = updatePlan({ sessionKey, planId, title, goal });
          if (!plan) throw new ToolInputError(`Plan "${planId}" not found`);
          return jsonResult({
            planId: plan.id,
            title: plan.title,
            steps: plan.steps,
            markdown: renderPlanMarkdown(plan),
          });
        }

        case "add_step": {
          if (!planId) throw new ToolInputError("planId is required for add_step action");
          const description = readStringParam(params, "stepDescription", { required: true }) ?? "";
          if (!description.trim()) throw new ToolInputError("stepDescription is required");
          const priority = typeof params.priority === "number" ? params.priority : undefined;
          const detail = readStringParam(params, "stepDetail");
          const insertBefore = readStringParam(params, "insertBefore");
          const insertAfter = readStringParam(params, "insertAfter");
          const plan = addStep({ sessionKey, planId, description, priority, detail, insertBefore, insertAfter });
          if (!plan) throw new ToolInputError(`Plan "${planId}" not found`);
          return jsonResult({
            planId: plan.id,
            title: plan.title,
            steps: plan.steps,
            stepId: plan.steps[plan.steps.length - 1]?.id,
            markdown: renderPlanMarkdown(plan),
          });
        }

        case "update_step": {
          if (!planId) throw new ToolInputError("planId is required for update_step action");
          const stepId = readStringParam(params, "stepId", { required: true });
          if (!stepId) throw new ToolInputError("stepId is required for update_step action");
          const status = readStringParam(params, "stepStatus") as TaskStepStatus | undefined;
          if (status && !["pending", "in_progress", "completed", "failed"].includes(status)) {
            throw new ToolInputError(`Invalid stepStatus "${status}". Must be one of: pending, in_progress, completed, failed`);
          }
          const description = readStringParam(params, "stepDescription");
          const detail = readStringParam(params, "stepDetail");
          const plan = updateStep({ sessionKey, planId, stepId, status, description, detail });
          if (!plan) throw new ToolInputError(`Plan "${planId}" or step "${stepId}" not found`);
          return jsonResult({
            planId: plan.id,
            title: plan.title,
            steps: plan.steps,
            markdown: renderPlanMarkdown(plan),
          });
        }

        case "remove_step": {
          if (!planId) throw new ToolInputError("planId is required for remove_step action");
          const stepId = readStringParam(params, "stepId", { required: true });
          if (!stepId) throw new ToolInputError("stepId is required for remove_step action");
          const plan = removeStep({ sessionKey, planId, stepId });
          if (!plan) throw new ToolInputError(`Plan "${planId}" or step "${stepId}" not found`);
          return jsonResult({
            planId: plan.id,
            title: plan.title,
            steps: plan.steps,
            markdown: renderPlanMarkdown(plan),
          });
        }

        case "reorder": {
          if (!planId) throw new ToolInputError("planId is required for reorder action");
          if (!Array.isArray(params.stepIds)) throw new ToolInputError("stepIds array is required for reorder action");
          const plan = reorderSteps({
            sessionKey,
            planId,
            stepIds: params.stepIds as string[],
          });
          if (!plan) throw new ToolInputError(`Plan "${planId}" not found`);
          return jsonResult({
            planId: plan.id,
            title: plan.title,
            steps: plan.steps,
            markdown: renderPlanMarkdown(plan),
          });
        }

        case "delete": {
          if (!planId) throw new ToolInputError("planId is required for delete action");
          const deleted = deletePlan(sessionKey, planId);
          if (!deleted) throw new ToolInputError(`Plan "${planId}" not found`);
          return jsonResult({ deleted: true, planId });
        }

        case "show":
        default: {
          if (planId) {
            const plan = getPlan(sessionKey, planId);
            if (!plan) throw new ToolInputError(`Plan "${planId}" not found`);
            return jsonResult({
              planId: plan.id,
              title: plan.title,
              steps: plan.steps,
              markdown: renderPlanMarkdown(plan),
              summary: renderPlanSummary(plan),
            });
          }
          // Show all plans
          const plans = getAllPlans(sessionKey);
          if (plans.length === 0) {
            return jsonResult({
              plans: [],
              markdown: "_No active task plans._",
            });
          }
          const allMarkdown = plans
            .map((p) => renderPlanMarkdown(p))
            .join("\n\n---\n\n");
          const summaries = plans.map((p) => renderPlanSummary(p));
          return jsonResult({
            plans: summaries,
            markdown: allMarkdown,
          });
        }
      }
    },
  };
}

// ─── Test Helpers ─────────────────────────────────────────────────

export const __testing = {
  resetStore() {
    planStore.clear();
    stepCounter = 0;
    planCounter = 0;
  },
  getStore() {
    return planStore;
  },
};
