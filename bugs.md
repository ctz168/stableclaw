# StableClaw Bug Tracker

> Last updated: 2026-04-07T00:55:00Z
> Tester: Auto QA Bot
> Version tested: 2026.5.8 (commit d6324a0a)

---

## Critical

### BUG-001: model-pricing 模块启动时超时崩溃
- **Severity**: Critical
- **Component**: `model-pricing`
- **Reproduction**: 启动 `stableclaw gateway run --full` 后约 40 秒触发
- **Description**: `model-pricing` 模块在启动 bootstrap 阶段抛出 `TimeoutError: The operation was aborted due to timeout`。虽然非致命错误不会导致网关退出，但会导致模型定价信息加载失败。
- **Log**:
  ```
  [model-pricing] pricing bootstrap failed: TimeoutError: The operation was aborted due to timeout
  ```
- **Environment**: Linux 5.10, Node.js 24.14.1
- **Status**: Open

### BUG-002: Lite 模式下 HTTP 健康检查端点无响应
- **Severity**: Critical
- **Component**: Gateway Lite Server
- **Reproduction**: `stableclaw gateway run --allow-unconfigured --bind loopback --port 18789`（不带 --full），启动后访问 `/healthz`、`/readyz`、`/health`、`/ready` 均返回空响应或 Connection Refused。
- **Description**: Lite 模式声称 "gateway kernel ready" 但实际 HTTP 端点不响应请求。`/ready` 返回 `{"error":"not found"}`，其他端点完全无响应。Full 模式下所有端点正常。
- **Status**: Open

---

## High

### BUG-003: 日志前缀截断 — 子系统名称显示不完整
- **Severity**: High
- **Component**: Logging subsystem
- **Description**: 多个子系统名称在日志输出中被截断，丢失了前缀字符。推测是异步日志格式化时与 console 输出竞争导致的缓冲区问题。
- **Affected subsystems**:
  - `[eartbeat]` — 应为 `[heartbeat]`
  - `[ealth-monitor]` — 应为 `[health-monitor]`
  - `[ooks]` — 应为 `[hooks]`
  - `[odel-pricing]` — 应为 `[model-pricing]`
- **Log example**:
  ```
  2026-04-07T00:40:01.423+00:00 eartbeat] started
  2026-04-07T00:40:01.425+00:00 ealth-monitor] started
  2026-04-07T00:40:08.716+00:00 ooks] loaded 5 internal hook handlers
  2026-04-07T00:41:25.884+00:00 odel-pricing] pricing bootstrap failed
  ```
- **Status**: Open

### BUG-004: Step-3.5-Flash 模型返回空内容
- **Severity**: High
- **Component**: Model integration (modelscope provider)
- **Reproduction**: 通过 ModelScope API 调用 `stepfun-ai/Step-3.5-Flash`，设置 `max_tokens: 100`
- **Description**: API 返回 HTTP 200，但 `choices[0].message.content` 为空字符串，`finish_reason` 为 `"length"`（即使只请求 100 tokens）。`completion_tokens` 显示消耗了 100 tokens 但实际无内容输出。可能是该模型在 ModelScope 上的推理配置问题。
- **Response**:
  ```json
  {"choices":[{"message":{"content":"","role":"assistant"},"finish_reason":"length"}],"usage":{"prompt_tokens":18,"completion_tokens":100,"total_tokens":118}}
  ```
- **Status**: Open (可能是 ModelScope 端问题)

### BUG-005: MiniMax-M2.5 模型返回 400 错误
- **Severity**: High
- **Component**: Model integration (modelscope provider)
- **Reproduction**: 通过 ModelScope API 调用 `Minimal/MiniMax-M2.5`
- **Description**: API 返回 HTTP 400，响应体缺少 `choices` 字段，导致 JSON 解析后访问 `choices[0]` 抛出 TypeError。
- **Status**: Open (需要检查 ModelScope 端是否支持该模型)

---

## Medium

### BUG-006: Config 首次写入异常 — missing-meta-before-write
- **Severity**: Medium
- **Component**: Configuration management
- **Description**: 首次启动网关时，配置写入触发 "Config write anomaly: missing-meta-before-write" 警告。这是因为配置文件在被 gateway 修改前缺少 `_meta` 字段。
- **Log**:
  ```
  Config write anomaly: /home/z/.stableclaw/stableclaw.json (missing-meta-before-write)
  ```
- **Impact**: 非致命，配置仍被正确写入，但产生不必要的告警。
- **Status**: Open

### BUG-007: Doctor 误报 package-lock.json 警告
- **Severity**: Medium
- **Component**: `stableclaw doctor`
- **Description**: `doctor` 命令警告 "package-lock.json present in a pnpm workspace"，但实际上 `package-lock.json` 是由 npm 自动生成的（`npm install -g pnpm` 过程中），不是用户手动创建的。在无法使用 sudo 的环境中这是正常的副作用。
- **Status**: Open

### BUG-008: `gateway start` 命令不支持 `--allow-unconfigured`
- **Severity**: Medium
- **Component**: CLI `gateway start` subcommand
- **Description**: `gateway run` 支持 `--allow-unconfigured` 标志，但 `gateway start`（系统服务模式）不支持此标志。在全新部署场景下，用户必须先手动配置 `gateway.mode` 才能使用 `gateway start`，增加了部署复杂度。
- **Status**: Open

### BUG-009: `gateway.mode` 未设置导致启动警告
- **Severity**: Medium
- **Component**: Configuration defaults
- **Description**: 全新安装后 `gateway.mode` 未设置，`doctor` 和 `gateway start` 都会警告。虽然 `gateway run --allow-unconfigured` 可以绕过，但默认行为应该更友好（例如自动检测 local 模式）。
- **Status**: Open

### BUG-010: Session store 目录缺失
- **Severity**: Medium
- **Component**: State management
- **Description**: `doctor` 报告 "CRITICAL: Session store dir missing (~/.stableclaw/agents/main/sessions)"。首次启动时应自动创建此目录。
- **Status**: Open

---

## Low

### BUG-011: Vitest 默认 glob 不匹配 .suite.ts 测试文件
- **Severity**: Low
- **Component**: Test configuration
- **Description**: 项目使用 `.suite.ts` 后缀命名集成测试文件（如 `server.auth.modes.suite.ts`），但 Vitest 默认只匹配 `*.{test,spec}.?(c|m)[jt]s?(x)`，导致这些测试无法通过 `pnpm vitest run` 执行。
- **Affected files**:
  - `src/gateway/server.auth.modes.suite.ts`
  - `src/gateway/server.auth.control-ui.suite.ts`
  - `src/gateway/server.auth.default-token.suite.ts`
- **Status**: Open

### BUG-012: 空测试文件 `lazy-registry.test.ts`
- **Severity**: Low
- **Component**: Test suite
- **Description**: `src/gateway/lazy-registry.test.ts` 存在但没有任何测试用例，导致 vitest 报告 "No test suite found" 错误。
- **Status**: Open

### BUG-013: Memory Search 需要 OpenAI/Google API Key 才能工作
- **Severity**: Low
- **Component**: Memory/embedding system
- **Description**: 即使配置了自定义模型提供商（如 ModelScope），Memory Search 模块仍然硬编码要求 OpenAI/Google/Voyage/Mistral 的 API Key 作为 embedding provider。不支持通过自定义 OpenAI-compatible 端点提供 embedding 服务。
- **Status**: Open

### BUG-014: 多状态目录检测告警
- **Severity**: Low
- **Component**: State migration
- **Description**: `doctor` 检测到 `~/.openclaw` 和 `~/.stableclaw` 两个状态目录，警告 "This can split session history"。应该提供自动合并工具或一键迁移功能。
- **Status**: Open

### BUG-015: Gateway 进程在 Shell 会话结束后意外终止
- **Severity**: Low
- **Component**: Process management
- **Description**: 通过 `node stableclaw.mjs gateway run` 在后台启动网关后，当父 Shell 会话结束时，网关进程也会被终止（即使使用 `nohup` 和 `disown`）。可能是 gateway 内部的进程 fork 机制导致子进程在父进程退出后无法独立存活。需要使用 `stableclaw gateway start`（systemd/launchd）来持久化运行。
- **Status**: Open

---

## Test Results Summary

| Test Category | Result | Details |
|---|---|---|
| `pnpm install` | PASS | 1160 packages installed successfully |
| `pnpm build` | PASS | TypeScript + plugin SDK build OK |
| `pnpm ui:build` | PASS | Vite build OK (42 chunks) |
| Gateway Full mode startup | PASS | ~15s cold start, all modules loaded |
| Gateway Lite mode startup | PASS | ~12ms kernel ready, 6s full init |
| `/healthz` endpoint (Full) | PASS | Returns `{"ok":true,"status":"live"}` |
| `/readyz` endpoint (Full) | PASS | Returns `{"ready":true,"failing":[]}` |
| `/healthz` endpoint (Lite) | **FAIL** | BUG-002 |
| Dashboard UI (`/`) | PASS | HTTP 200 |
| Canvas UI | PASS | HTTP 401 (expected - requires auth) |
| `stableclaw models list` | PASS | Shows configured ModelScope models |
| `stableclaw status` | PASS | Full status report OK |
| `stableclaw doctor` | WARN | Multiple warnings (BUG-006 to BUG-010) |
| ModelScope GLM-5 API | PASS | Returns valid response |
| ModelScope Kimi-K2.5 API | PASS | Returns valid response |
| ModelScope Step-3.5-Flash | **FAIL** | BUG-004 |
| ModelScope MiniMax-M2.5 | **FAIL** | BUG-005 |
| Vitest test suite | **FAIL** | BUG-011, BUG-012 |
