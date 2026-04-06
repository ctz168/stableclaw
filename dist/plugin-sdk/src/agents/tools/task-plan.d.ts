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
import type { AnyAgentTool } from "./common.js";
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
/**
 * Render the full plan as a markdown checklist.
 * This is what gets shown to the user as progress.
 */
export declare function renderPlanMarkdown(plan: TaskPlan): string;
/**
 * Render a compact single-line progress summary.
 */
export declare function renderPlanSummary(plan: TaskPlan): string;
export declare function getPlan(sessionKey: string, planId: string): TaskPlan | undefined;
export declare function getAllPlans(sessionKey: string): TaskPlan[];
export declare function createPlan(params: {
    sessionKey: string;
    title: string;
    goal?: string;
    steps?: Array<{
        description: string;
        priority?: number;
        detail?: string;
    }>;
}): TaskPlan;
export declare function updatePlan(params: {
    sessionKey: string;
    planId: string;
    title?: string;
    goal?: string;
}): TaskPlan | null;
export declare function deletePlan(sessionKey: string, planId: string): boolean;
export declare function addStep(params: {
    sessionKey: string;
    planId: string;
    description: string;
    priority?: number;
    detail?: string;
    insertBefore?: string;
    insertAfter?: string;
}): TaskPlan | null;
export declare function updateStep(params: {
    sessionKey: string;
    planId: string;
    stepId: string;
    status?: TaskStepStatus;
    description?: string;
    detail?: string;
}): TaskPlan | null;
export declare function removeStep(params: {
    sessionKey: string;
    planId: string;
    stepId: string;
}): TaskPlan | null;
export declare function reorderSteps(params: {
    sessionKey: string;
    planId: string;
    stepIds: string[];
}): TaskPlan | null;
/**
 * Clear all plans for a session (e.g., on session reset).
 */
export declare function clearSessionPlans(sessionKey: string): void;
/**
 * Set the workspace directory for a session. Used for task.md persistence.
 */
export declare function setSessionWorkspaceDir(sessionKey: string, workspaceDir: string): void;
/**
 * Synchronize all plans for a session to task.md.
 * The file contains a rendered markdown version of all active plans.
 */
export declare function syncPlansToTaskMd(sessionKey: string): Promise<{
    ok: boolean;
    path?: string;
    error?: string;
}>;
/**
 * Load plans from task.md (best-effort, informational only).
 * Returns the raw content of task.md for the session's workspace.
 */
export declare function loadTaskMdContent(sessionKey: string): Promise<{
    content?: string;
    path?: string;
    error?: string;
}>;
/**
 * Create the task_plan tool — Claude-style task decomposition and progress tracking.
 *
 * This single tool handles all plan operations (create, update, add/remove steps,
 * mark progress) via the `action` parameter. The tool returns markdown-formatted
 * progress that can be shown to the user.
 */
export declare function createTaskPlanTool(opts?: {
    sessionKey?: string;
    /** Workspace directory for task.md persistence. */
    workspaceDir?: string;
}): AnyAgentTool;
export declare const __testing: {
    resetStore(): void;
    getStore(): Map<string, Map<string, TaskPlan>>;
    getWorkspaceDirs(): Map<string, string>;
};
