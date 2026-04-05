import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskItem = {
  text: string;
  checked: boolean;
  index: number; // line index in the markdown source
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
};

// ---------------------------------------------------------------------------
// Parsing & mutation helpers
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
// Ephemeral UI state (module-scoped singleton, similar to chat.ts vs pattern)
// ---------------------------------------------------------------------------

let taskInputValue = "";
let taskInputKey = 0;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

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

  const tasks = props.content ? parseTaskMd(props.content) : [];
  const checkedCount = tasks.filter((t) => t.checked).length;
  const totalCount = tasks.length;
  const hasTasks = totalCount > 0;

  if (!hasTasks && !props.content) {
    return nothing;
  }

  const headerLabel = hasTasks
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
            ${hasTasks
              ? html`
                <ul class="task-panel__list">
                  ${tasks.map(
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
