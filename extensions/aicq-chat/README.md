# AICQ Chat Plugin for StableClaw

## Installation

The AICQ chat plugin is installed at `~/.openclaw/extensions/aicq-chat/`.

### Build from source

```bash
cd ~/.openclaw/extensions/aicq-chat
npm install  # install dependencies (ws, uuid, qrcode, dotenv)
npx tsc     # compile TypeScript to dist/
```

### Configuration

Already configured in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["~/.openclaw/extensions/aicq-chat"]
    },
    "allow": ["aicq-chat"],
    "entries": {
      "aicq-chat": {
        "enabled": true,
        "serverUrl": "ws://localhost:3000",
        "agentId": "auto-generated",
        "maxFriends": 200,
        "autoAcceptFriends": false
      }
    }
  }
}
```

### Registered Tools

| Tool | Description |
|------|-------------|
| `chat-friend` | Manage friends: request-temp-number, list, add, remove |
| `chat-send` | Send encrypted message to a friend |
| `chat-export-key` | Export identity key as password-protected QR |

### Hot-Pluggability

The plugin is loaded via `plugins.load.paths` at gateway startup.
To reload without restarting:
1. Disable the plugin: Set `plugins.entries.aicq-chat.enabled = false`
2. Delete and re-copy the plugin directory
3. Re-enable: Set `plugins.entries.aicq-chat.enabled = true`

### Compatibility

- **StableClaw fork**: This is a standalone version that does NOT depend
  on `openclaw/plugin-sdk` or `@aicq/crypto`. Tools make HTTP calls
  to the AICQ relay server directly.
- **E2E Encryption**: The server relay handles message forwarding.
  Full P2P encryption requires the aicq-crypto library integration.
- **Skills/Channels**: Does not modify any channels, skills, or core skills.

### Source Reference

Original plugin: `ctz168/aicq`
Standalone adaptation: `extensions/aicq-chat/` (removed crypto dependency)
