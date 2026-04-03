---
name: workflow-summary
description: "Generate and persist workflow summaries after each agent task completion for long-session context preservation"
metadata:
  {
    "openclaw":
      {
        "emoji": "📋",
        "events": ["agent:end"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with StableClaw" }],
      },
  }
---

# Workflow Summary Hook

Automatically generates a structured workflow summary after each agent task
completion and persists it to memory. When context grows long, the summary is
injected into the prompt alongside recent messages, ensuring high reply quality
even after compaction.

## What It Does

After each agent run completes:

1. **Extracts key information** from the session messages — completed tasks,
   file edits, decisions, pending items.
2. **Saves a structured summary** to `memory/workflow-summaries/` as JSON.
3. **On subsequent long-session runs**, injects the accumulated workflow
   summary as `prependContext`, plus keeps the most recent 15 messages intact.

## Why This Matters

When the conversation exceeds the model's context window, OpenClaw's compaction
summarizes older messages. This can lose critical details like:

- Which files were modified and why
- What decisions were made and their rationale
- What tasks are still pending
- Important context from earlier in the conversation

The workflow summary provides a **proactive, structured** record that survives
compaction and gives the agent accurate context for continuing work.

## How It Integrates with Compaction

| Scenario | Without Workflow Summary | With Workflow Summary |
|---|---|---|
| Context < 50% | Full history | Full history |
| Context > 50% | History begins pruning | Workflow summary injected + recent 15 messages preserved |
| Compaction triggered | LLM summarizes old messages | Workflow summary used as reference + recent messages + minimal compaction |

## Output Format

Summary files are stored at:
```
<workspace>/memory/workflow-summaries/YYYY-MM-DD-summary-HHmmss.json
```

Each file contains:
```json
{
  "createdAt": "2026-04-04T12:00:00.000Z",
  "sessionKey": "agent:main:main",
  "entries": [
    {
      "timestamp": "2026-04-04T12:00:00.000Z",
      "taskLabel": "fix timeout configuration",
      "outcomes": ["edited src/agents/timeout.ts", "commit d4d36b60"],
      "decisions": ["Default timeout changed to 3 minutes for faster failure detection"],
      "pending": ["Test timeout behavior with long-running tasks"],
      "importantContext": ["User prefers explicit error messages over silent timeouts"]
    }
  ]
}
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | true | Enable/disable the workflow summary system |
| `recentMessages` | number | 15 | Number of recent messages to preserve in full |

Example:
```json
{
  "hooks": {
    "internal": {
      "entries": {
        "workflow-summary": {
          "enabled": true,
          "recentMessages": 20
        }
      }
    }
  }
}
```

## Requirements

- **Config**: `workspace.dir` must be set (automatically configured during setup)

## Disabling

```bash
openclaw hooks disable workflow-summary
```

Or in config:
```json
{
  "hooks": {
    "internal": {
      "entries": {
        "workflow-summary": { "enabled": false }
      }
    }
  }
}
```
