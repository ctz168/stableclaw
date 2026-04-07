import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export type RichTaskItem = {
  id: string;
  text: string;
  status: TaskStatus;
  detail?: string;
  index: number; // line index in the markdown source
};

export type ParsedPlan = {
  title: string;
  goal?: string;
  progress: number; // 0-100
  completedCount: number;
  totalCount: number;
  failedCount: number;
  inProgressCount: number;
  tasks: RichTaskItem[];
  startLine: number;
  endLine: number;
};

/** Legacy type kept for backward compatibility with chat.ts */
export type TaskItem = {
  text: string;
  checked: boolean;
  index: number;
};

export type TaskPanelProps = {
  content: string | null;
  loading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCheckToggle: (task: TaskItem) => void;
  onRemove: (task: TaskItem) => void;
  onAdd: (text: string) => void;
  hasTasks: boolean;
  /** Callback for rich-format mutations (status cycle, edit, reorder, remove) */
  onTaskMdChange?: (content: string) => void;
};

// ---------------------------------------------------------------------------
// Rich Markdown Parsing
// ---------------------------------------------------------------------------

const PLAN_HEADER_RE = /^## 📋\s+(.+)/;
const GOAL_RE = /^\*\*Goal:\*\*\s*(.+)/;
const PROGRESS_BAR_RE = /^\[([█░]+)\]\s*(\d+)%.*$/;
const STATUS_COUNT_RE = /^(🔄|⚠️)\s+\d+\s+step\(s\)\s+(in progress|failed)/;
const TASK_LINE_RE = /^(⬜|🔄|✅|❌)\s+(.+)/;
const COMPLETED_STRIKE_RE = /^~~(.+)~~$/;

const STATUS_EMOJI: Record<string, TaskStatus> = {
  "⬜": "pending",
  "🔄": "in_progress",
  "✅": "completed",
  "❌": "failed",
};

const STATUS_EMOJI_BY_VALUE: Record<TaskStatus, string> = {
  pending: "⬜",
  in_progress: "🔄",
  completed: "✅",
  failed: "❌",
};

export function parseRichTaskMd(content: string): ParsedPlan[] {
  const lines = content.split("\n");
  const plans: ParsedPlan[] = [];
  let currentPlan: ParsedPlan | null = null;
  let taskLineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip the overall task plan header
    if (/^# Task Plan/.test(line) || /^_Last updated:/.test(line) || line === "") {
      continue;
    }

    // Plan separator
    if (/^---$/.test(line)) {
      if (currentPlan) {
        currentPlan.endLine = i;
        plans.push(currentPlan);
        currentPlan = null;
      }
      continue;
    }

    // Plan header
    const headerMatch = line.match(PLAN_HEADER_RE);
    if (headerMatch) {
      if (currentPlan) {
        currentPlan.endLine = i - 1;
        plans.push(currentPlan);
      }
      currentPlan = {
        title: headerMatch[1].trim(),
        goal: undefined,
        progress: 0,
        completedCount: 0,
        totalCount: 0,
        failedCount: 0,
        inProgressCount: 0,
        tasks: [],
        startLine: i,
        endLine: i,
      };
      continue;
    }

    if (!currentPlan) continue;

    // Goal
    const goalMatch = line.match(GOAL_RE);
    if (goalMatch) {
      currentPlan.goal = goalMatch[1].trim();
      continue;
    }

    // Progress bar
    const progressMatch = line.match(PROGRESS_BAR_RE);
    if (progressMatch) {
      currentPlan.progress = parseInt(progressMatch[2], 10);
      continue;
    }

    // Status count lines
    const statusMatch = line.match(STATUS_COUNT_RE);
    if (statusMatch) {
      if (statusMatch[2] === "in progress") {
        const count = parseInt(line.replace(/\D/g, "").split("step")[0], 10);
        currentPlan.inProgressCount = count || 0;
      } else if (statusMatch[2] === "failed") {
        const count = parseInt(line.replace(/\D/g, "").split("step")[0], 10);
        currentPlan.failedCount = count || 0;
      }
      continue;
    }

    // Task lines
    const taskMatch = line.match(TASK_LINE_RE);
    if (taskMatch) {
      const status = STATUS_EMOJI[taskMatch[1]] ?? "pending";
      let rawText = taskMatch[2].trim();

      // Parse detail (italic suffix)
      let detail: string | undefined;
      const detailMatch = rawText.match(/^(.+?)\s+—\s+_([^_]+)_$/);
      if (detailMatch) {
        rawText = detailMatch[1].trim();
        detail = detailMatch[2].trim();
      }

      // Parse strikethrough for completed tasks
      let text = rawText;
      const strikeMatch = rawText.match(COMPLETED_STRIKE_RE);
      if (strikeMatch) {
        text = strikeMatch[1].trim();
      }

      currentPlan.tasks.push({
        id: `task-${taskLineIndex}`,
        text,
        status,
        detail,
        index: i,
      });
      taskLineIndex++;

      if (status === "completed") currentPlan.completedCount++;
      if (status === "failed") currentPlan.failedCount++;
      if (status === "in_progress") currentPlan.inProgressCount++;
      continue;
    }

    // No steps message
    if (/^_No steps defined yet._$/.test(line)) {
      continue;
    }
  }

  if (currentPlan) {
    currentPlan.endLine = lines.length - 1;
    plans.push(currentPlan);
  }

  return plans;
}

// ---------------------------------------------------------------------------
// Rich Markdown Mutation Helpers
// ---------------------------------------------------------------------------

function getNextStatus(status: TaskStatus): TaskStatus {
  const cycle: TaskStatus[] = ["pending", "in_progress", "completed", "failed"];
  const idx = cycle.indexOf(status);
  return cycle[(idx + 1) % cycle.length];
}

export function cycleTaskStatus(content: string, task: RichTaskItem): string {
  const lines = content.split("\n");
  if (task.index >= 0 && task.index < lines.length) {
    const nextStatus = getNextStatus(task.status);
    const emoji = STATUS_EMOJI_BY_VALUE[nextStatus];
    let newText = task.text;
    if (nextStatus === "completed") {
      newText = `~~${task.text}~~`;
    }
    if (task.detail) {
      newText += ` — _${task.detail}_`;
    }
    lines[task.index] = `${emoji} ${newText}`;
  }
  return lines.join("\n");
}

export function editTaskContent(content: string, task: RichTaskItem, newText: string): string {
  const lines = content.split("\n");
  if (task.index >= 0 && task.index < lines.length) {
    const emoji = STATUS_EMOJI_BY_VALUE[task.status];
    let displayText = newText;
    if (task.status === "completed") {
      displayText = `~~${newText}~~`;
    }
    if (task.detail) {
      displayText += ` — _${task.detail}_`;
    }
    lines[task.index] = `${emoji} ${displayText}`;
  }
  return lines.join("\n");
}

export function removeRichTask(content: string, task: RichTaskItem): string {
  const lines = content.split("\n");
  lines.splice(task.index, 1);
  return lines.join("\n");
}

export function addRichTask(content: string, text: string): string {
  const line = `⬜ ${text}`;
  if (content.trim()) {
    return content.trimEnd() + "\n" + line + "\n";
  }
  return line + "\n";
}

export function reorderTasks(content: string, tasks: RichTaskItem[], fromIndex: number, toIndex: number): string {
  const lines = content.split("\n");
  // Extract the line at fromIndex
  const [movedLine] = lines.splice(fromIndex, 1);
  // Insert at toIndex
  if (toIndex >= lines.length) {
    lines.push(movedLine);
  } else {
    lines.splice(toIndex, 0, movedLine);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Legacy parsing & mutation (backward compat with checkbox format)
// ---------------------------------------------------------------------------

const TASK_RE = /^[-*]\s+\[([xX ])\]\s+(.+)/;

export function parseTaskMd(content: string): TaskItem[] {
  const lines = content.split("\n");
  const tasks: TaskItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_RE);
    if (match) {
      tasks.push({ text: match[2].trim(), checked: match[1] !== " ", index: i });
    }
  }
  return tasks;
}

export function toggleTaskCheck(content: string, task: TaskItem): string {
  const lines = content.split("\n");
  if (task.index >= 0 && task.index < lines.length) {
    const newChecked = task.checked ? " " : "x";
    lines[task.index] = lines[task.index].replace(/^([-*]\s+)\[([xX ])\]/, `$1[${newChecked}]`);
  }
  return lines.join("\n");
}

export function removeTask(content: string, task: TaskItem): string {
  const lines = content.split("\n");
  lines.splice(task.index, 1);
  return lines.join("\n");
}

export function addTask(content: string, text: string): string {
  const line = `- [ ] ${text}`;
  if (content.trim()) {
    return content.trimEnd() + "\n" + line + "\n";
  }
  return line + "\n";
}

// ---------------------------------------------------------------------------
// Ephemeral UI state
// ---------------------------------------------------------------------------

let taskInputValue = "";
let taskInputKey = 0;
let activePlanIndex = 0;
let editingTaskIndex: number | null = null;
let editInputValue = "";
let dragSourceIndex: number | null = null;
let dragOverIndex: number | null = null;
let dragOverPosition: "before" | "after" = "before";

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  pending: { label: "Pending", color: "var(--muted)", bgColor: "transparent", icon: "⬜" },
  in_progress: { label: "In Progress", color: "var(--accent)", bgColor: "rgba(var(--accent-rgb, 99,102,241), 0.08)", icon: "🔄" },
  completed: { label: "Completed", color: "var(--success, #22c55e)", bgColor: "rgba(34,197,94, 0.08)", icon: "✅" },
  failed: { label: "Failed", color: "var(--danger, #ef4444)", bgColor: "rgba(239,68,68, 0.08)", icon: "❌" },
};

// ---------------------------------------------------------------------------
// Drag handle SVG
// ---------------------------------------------------------------------------

const DRAG_HANDLE = html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" opacity="0.4">
  <circle cx="9" cy="6" r="1.5" />
  <circle cx="15" cy="6" r="1.5" />
  <circle cx="9" cy="12" r="1.5" />
  <circle cx="15" cy="12" r="1.5" />
  <circle cx="9" cy="18" r="1.5" />
  <circle cx="15" cy="18" r="1.5" />
</svg>`;

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderProgressBar(pct: number, completed: number, total: number): TemplateResult {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return html`
    <div class="task-panel__progress">
      <div class="task-panel__progress-bar" aria-hidden="true">
        <span class="task-panel__progress-fill" style="--fill-pct: ${pct}%">
          ${bar}
        </span>
      </div>
      <span class="task-panel__progress-text">${pct}% (${completed}/${total} done)</span>
    </div>
  `;
}

function renderPlanTabs(plans: ParsedPlan[]): TemplateResult {
  if (plans.length <= 1) return nothing;
  return html`
    <div class="task-panel__tabs" role="tablist">
      ${plans.map(
        (plan, i) => html`
          <button
            class="task-panel__tab ${i === activePlanIndex ? "task-panel__tab--active" : ""}"
            role="tab"
            aria-selected=${i === activePlanIndex}
            @click=${() => {
              activePlanIndex = i;
              editingTaskIndex = null;
              // Trigger re-render via toggling expanded state
              const event = new CustomEvent("task-panel:refresh");
              document.dispatchEvent(event);
            }}
          >
            <span class="task-panel__tab-label">Plan ${i + 1}</span>
            <span class="task-panel__tab-count">${plan.completedCount}/${plan.totalCount}</span>
          </button>
        `,
      )}
    </div>
  `;
}

function renderStatusIcon(status: TaskStatus): TemplateResult {
  const cfg = STATUS_CONFIG[status];
  return html`
    <span
      class="task-panel__status-icon"
      style="color: ${cfg.color}"
      title=${cfg.label}
      data-status=${status}
    >${cfg.icon}</span>
  `;
}

function renderTaskItem(
  task: RichTaskItem,
  props: TaskPanelProps,
  requestRefresh: () => void,
): TemplateResult {
  const cfg = STATUS_CONFIG[task.status];
  const isEditing = editingTaskIndex === task.index;
  const isDragging = dragSourceIndex === task.index;
  const isDragOver = dragOverIndex === task.index;

  if (isEditing) {
    return html`
      <li
        class="task-panel__item task-panel__item--editing"
        style="--item-status-color: ${cfg.color}; --item-bg: ${cfg.bgColor}"
        data-task-index=${task.index}
      >
        <span class="task-panel__drag-handle">${DRAG_HANDLE}</span>
        ${renderStatusIcon(task.status)}
        <input
          type="text"
          class="task-panel__edit-input"
          .value=${editInputValue}
          @input=${(e: Event) => {
            editInputValue = (e.target as HTMLInputElement).value;
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const newText = editInputValue.trim();
              if (newText && props.content) {
                const next = editTaskContent(props.content, task, newText);
                props.onTaskMdChange?.(next);
              }
              editingTaskIndex = null;
              editInputValue = "";
              requestRefresh();
            }
            if (e.key === "Escape") {
              editingTaskIndex = null;
              editInputValue = "";
              requestRefresh();
            }
          }}
          @blur=${() => {
            // Small delay to allow Enter key handler to fire first
            setTimeout(() => {
              if (editingTaskIndex === task.index) {
                editingTaskIndex = null;
                editInputValue = "";
                requestRefresh();
              }
            }, 150);
          }}
          aria-label="Edit task text"
        />
        <button
          class="btn btn--ghost task-panel__edit-save"
          type="button"
          title="Save"
          @click=${() => {
            const newText = editInputValue.trim();
            if (newText && props.content) {
              const next = editTaskContent(props.content, task, newText);
              props.onTaskMdChange?.(next);
            }
            editingTaskIndex = null;
            editInputValue = "";
            requestRefresh();
          }}
        >
          ${icons.check}
        </button>
      </li>
    `;
  }

  return html`
    <li
      class="task-panel__item task-panel__item--${task.status} ${isDragging ? "task-panel__item--dragging" : ""} ${isDragOver ? `task-panel__item--drag-over-${dragOverPosition}` : ""}"
      style="--item-status-color: ${cfg.color}; --item-bg: ${cfg.bgColor}"
      draggable="true"
      data-task-index=${task.index}
      @dragstart=${(e: DragEvent) => {
        dragSourceIndex = task.index;
        (e.target as HTMLElement).classList.add("task-panel__item--dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(task.index));
        }
      }}
      @dragend=${(e: DragEvent) => {
        (e.target as HTMLElement).classList.remove("task-panel__item--dragging");
        dragSourceIndex = null;
        dragOverIndex = null;
      }}
      @dragover=${(e: DragEvent) => {
        e.preventDefault();
        if (dragSourceIndex === null || dragSourceIndex === task.index) return;
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        dragOverIndex = task.index;
        dragOverPosition = e.clientY < midY ? "before" : "after";
        requestRefresh();
      }}
      @dragleave=${() => {
        dragOverIndex = null;
        requestRefresh();
      }}
      @drop=${(e: DragEvent) => {
        e.preventDefault();
        if (dragSourceIndex === null || !props.content) return;
        const fromLine = dragSourceIndex;
        let toLine = task.index;
        if (dragOverPosition === "after") {
          toLine = task.index + 1;
        }
        if (fromLine === toLine || fromLine === toLine - 1) {
          dragSourceIndex = null;
          dragOverIndex = null;
          requestRefresh();
          return;
        }
        const next = reorderTasks(props.content, [], fromLine, fromLine < toLine ? toLine - 1 : toLine);
        props.onTaskMdChange?.(next);
        dragSourceIndex = null;
        dragOverIndex = null;
        requestRefresh();
      }}
    >
      <span class="task-panel__drag-handle" title="Drag to reorder">${DRAG_HANDLE}</span>
      <button
        class="task-panel__status-btn"
        type="button"
        title="Click to change status"
        @click=${() => {
          if (!props.content) return;
          const next = cycleTaskStatus(props.content, task);
          props.onTaskMdChange?.(next);
        }}
      >
        ${renderStatusIcon(task.status)}
      </button>
      <span
        class="task-panel__text ${task.status === "completed" ? "task-panel__text--done" : ""}"
        @dblclick=${() => {
          editingTaskIndex = task.index;
          editInputValue = task.text;
          requestRefresh();
          // Focus the input after render
          requestAnimationFrame(() => {
            const input = document.querySelector(`.task-panel__item[data-task-index="${task.index}"] .task-panel__edit-input`) as HTMLInputElement;
            input?.focus();
            input?.select();
          });
        }}
        title="Double-click to edit"
      >${task.text}</span>
      ${task.detail
        ? html`<span class="task-panel__detail" title="${task.detail}">— ${task.detail}</span>`
        : nothing}
      <button
        class="btn btn--ghost task-panel__remove"
        type="button"
        title="Remove task"
        aria-label="Remove task"
        @click=${() => {
          if (!props.content) return;
          const next = removeRichTask(props.content, task);
          props.onTaskMdChange?.(next);
        }}
      >
        ${icons.trash}
      </button>
    </li>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

function createRefreshCallback(props: TaskPanelProps): () => void {
  return () => {
    const event = new CustomEvent("task-panel:refresh");
    document.dispatchEvent(event);
  };
}

export function renderTaskPanel(props: TaskPanelProps): TemplateResult | typeof nothing {
  if (props.loading && !props.content) {
    return html`
      <div class="task-panel task-panel--loading">
        <div class="task-panel__header">
          <span class="task-panel__icon">${icons.loader}</span>
          <span class="task-panel__title">Loading tasks...</span>
        </div>
      </div>
    `;
  }

  // Try rich format first, fall back to legacy checkbox format
  const plans = props.content ? parseRichTaskMd(props.content) : [];
  const isRichFormat = plans.length > 0 || props.content?.includes("📋") || false;
  const legacyTasks = !isRichFormat ? (props.content ? parseTaskMd(props.content) : []) : [];

  const allTasks = isRichFormat
    ? plans.flatMap((p) => p.tasks)
    : legacyTasks;
  const hasTasks = allTasks.length > 0;

  if (!hasTasks && !props.content) {
    return nothing;
  }

  const requestRefresh = createRefreshCallback(props);

  // Rich format header
  if (isRichFormat) {
    // Clamp active plan index
    if (activePlanIndex >= plans.length) {
      activePlanIndex = Math.max(0, plans.length - 1);
    }
    const activePlan = plans[activePlanIndex] ?? plans[0];
    if (!activePlan) {
      return nothing;
    }

    const tasks = activePlan.tasks;
    const totalCount = tasks.length;
    const completedCount = tasks.filter((t) => t.status === "completed").length;

    return html`
      <div class="task-panel task-panel--rich">
        <button
          class="task-panel__header"
          type="button"
          @click=${() => props.onToggle()}
          aria-expanded=${props.expanded}
        >
          <span class="task-panel__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <rect x="3" y="5" width="6" height="6" rx="1" />
              <path d="m3 17 2 2 4-4" />
              <path d="M13 6h8" />
              <path d="M13 12h8" />
              <path d="M13 18h8" />
            </svg>
          </span>
          <span class="task-panel__title">
            ${activePlan.title}
            <span class="task-panel__badge">${completedCount}/${totalCount}</span>
          </span>
          <span class="collapse-chevron ${props.expanded ? "" : "collapse-chevron--collapsed"}">
            ${icons.chevronDown}
          </span>
        </button>

        ${props.expanded
          ? html`
            <div class="task-panel__body">
              ${renderPlanTabs(plans)}

              ${activePlan.goal
                ? html`<div class="task-panel__goal"><strong>Goal:</strong> ${activePlan.goal}</div>`
                : nothing}

              ${totalCount > 0
                ? renderProgressBar(activePlan.progress, completedCount, totalCount)
                : nothing}

              ${(activePlan.inProgressCount > 0 || activePlan.failedCount > 0)
                ? html`
                  <div class="task-panel__status-summary">
                    ${activePlan.inProgressCount > 0
                      ? html`<span class="task-panel__status-badge task-panel__status-badge--progress">🔄 ${activePlan.inProgressCount} in progress</span>`
                      : nothing}
                    ${activePlan.failedCount > 0
                      ? html`<span class="task-panel__status-badge task-panel__status-badge--failed">❌ ${activePlan.failedCount} failed</span>`
                      : nothing}
                  </div>
                `
                : nothing}

              ${tasks.length > 0
                ? html`
                  <ul class="task-panel__list">
                    ${tasks.map((task) => renderTaskItem(task, props, requestRefresh))}
                  </ul>
                `
                : html`
                  <div class="task-panel__empty">
                    <span class="task-panel__empty-icon">📋</span>
                    <span>No steps defined yet</span>
                  </div>
                `}

              <form
                class="task-panel__add"
                @submit=${(e: Event) => {
                  e.preventDefault();
                  const value = taskInputValue.trim();
                  if (!value) return;
                  if (props.content) {
                    const next = addRichTask(props.content, value);
                    props.onTaskMdChange?.(next);
                  } else {
                    props.onAdd(value);
                  }
                  taskInputValue = "";
                  taskInputKey++;
                }}
              >
                <input
                  type="text"
                  class="task-panel__input"
                  placeholder="Add a new task..."
                  .value=${taskInputValue}
                  @input=${(e: Event) => {
                    taskInputValue = (e.target as HTMLInputElement).value;
                  }}
                  aria-label="New task text"
                />
                <button
                  class="btn btn--ghost task-panel__add-btn"
                  type="submit"
                  title="Add task"
                  aria-label="Add task"
                >
                  ${icons.plus}
                </button>
              </form>
            </div>
          `
          : nothing}
      </div>
    `;
  }

  // Legacy checkbox format (backward compatibility)
  const checkedCount = legacyTasks.filter((t) => t.checked).length;
  const totalCount = legacyTasks.length;

  const headerLabel = totalCount > 0
    ? `Tasks (${checkedCount}/${totalCount})`
    : "Tasks";

  return html`
    <div class="task-panel">
      <button
        class="task-panel__header"
        type="button"
        @click=${() => props.onToggle()}
        aria-expanded=${props.expanded}
      >
        <span class="task-panel__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <rect x="3" y="5" width="6" height="6" rx="1" />
            <path d="m3 17 2 2 4-4" />
            <path d="M13 6h8" />
            <path d="M13 12h8" />
            <path d="M13 18h8" />
          </svg>
        </span>
        <span class="task-panel__title">${headerLabel}</span>
        <span class="collapse-chevron ${props.expanded ? "" : "collapse-chevron--collapsed"}">
          ${icons.chevronDown}
        </span>
      </button>

      ${props.expanded
        ? html`
          <div class="task-panel__body">
            ${totalCount > 0
              ? html`
                <ul class="task-panel__list">
                  ${legacyTasks.map(
                    (task) => html`
                      <li class="task-panel__item ${task.checked ? "task-panel__item--done" : ""}">
                        <label class="task-panel__check">
                          <input
                            type="checkbox"
                            .checked=${task.checked}
                            @change=${() => props.onCheckToggle(task)}
                            aria-label=${`Toggle: ${task.text}`}
                          />
                          <span class="task-panel__check-box">
                            ${task.checked ? icons.check : nothing}
                          </span>
                          <span class="task-panel__text">${task.text}</span>
                        </label>
                        <button
                          class="btn btn--ghost task-panel__remove"
                          type="button"
                          title="Remove task"
                          aria-label="Remove task"
                          @click=${() => props.onRemove(task)}
                        >
                          ${icons.trash}
                        </button>
                      </li>
                    `,
                  )}
                </ul>
              `
              : html`
                <div class="task-panel__empty">No tasks yet</div>
              `}
            <form
              class="task-panel__add"
              @submit=${(e: Event) => {
                e.preventDefault();
                const value = taskInputValue.trim();
                if (!value) return;
                props.onAdd(value);
                taskInputValue = "";
                taskInputKey++;
              }}
            >
              <input
                type="text"
                class="task-panel__input"
                placeholder="Add a new task..."
                .value=${taskInputValue}
                @input=${(e: Event) => {
                  taskInputValue = (e.target as HTMLInputElement).value;
                }}
                aria-label="New task text"
              />
              <button
                class="btn btn--ghost task-panel__add-btn"
                type="submit"
                title="Add task"
                aria-label="Add task"
              >
                ${icons.plus}
              </button>
            </form>
          </div>
        `
        : nothing}
    </div>
  `;
}
