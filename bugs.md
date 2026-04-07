# StableClaw Bug Tracker

> Last updated: 2026-04-07T09:25:00+08:00
> Tester: Auto QA Bot (Comprehensive Check)
> Version tested: 2026.5.9 (commit 76b9dbde)

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

### BUG-002: Lite 模式下 `/readyz` 和 `/ready` 端点返回 404
- **Severity**: Critical
- **Component**: Gateway Lite Server
- **Reproduction**: `stableclaw gateway run --allow-unconfigured --bind loopback --port 18789`，启动后访问 `/readyz`、`/ready`
- **Description**: Lite 模式下 `/readyz` 和 `/ready` 返回 `{"error":"not found"}`，而 `/healthz` 和 `/health` 在等待模块完全加载后（约 7 秒）能正常返回完整状态信息。`/` 根路径和 `/canvas` 返回 HTTP 503，提示需要 `pnpm ui:build` 构建 UI 资源。
- **Note**: 上次测试（v2026.5.8）时 `/healthz` 完全无响应，当前版本（v2026.5.9）`/healthz` 和 `/health` 已修复可用，但 `/readyz` 和 `/ready` 仍然 404。
- **Status**: Open (部分改善)

### BUG-016: `pnpm build` 构建失败 — ConfigValidate 类型未导出
- **Severity**: Critical
- **Component**: `src/gateway/protocol/schema/config.ts` / `src/gateway/protocol/index.ts`
- **Introduced in**: commit `18fa66b4` (feat: enhance hot config with startup backup restore and pre-save validation)
- **Reproduction**: 执行 `pnpm build`
- **Description**: `build:plugin-sdk:dts` 步骤报错，`src/gateway/protocol/index.ts` 导入了 `type ConfigValidateParams` 和 `type ConfigValidateResult`，但 `src/gateway/protocol/schema/config.ts` 中只导出了 Schema const，未导出对应的 TypeScript 类型。
- **Fixed in**: commit `73ce22e8`
- **Status**: Fixed ✅ (verified: `pnpm build` passes in v2026.5.9)

### BUG-017: `npx tsc --noEmit` 因内存溢出崩溃
- **Severity**: Critical
- **Component**: TypeScript compilation
- **Reproduction**: 执行 `npx tsc --noEmit`
- **Description**: 全量 TypeScript 类型检查消耗超过 2GB 内存后触发 OOM（FATAL ERROR: Ineffective mark-compacts near heap limit）。项目体积庞大（3189 个源文件），默认 Node.js 堆内存不足以完成全量类型检查。虽然 `pnpm build` 使用的 tsconfig.plugin-sdk.dts.json 可以正常通过，但全量 `tsc --noEmit` 无法运行。
- **Error**:
  ```
  FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
  ```
- **Workaround**: `NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit` 或仅使用项目配置的 tsconfig
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
- **Reproduction**: 通过 ModelScope API 调用 `stepfun-ai/Step-3.5-Flash`，设置 `max_tokens: 50`
- **Description**: API 返回 HTTP 200，但 `choices[0].message.content` 始终为空字符串，`finish_reason` 为 `"length"`。无论请求多少 tokens，内容始终为空。本次测试再次确认问题持续存在。
- **Response**:
  ```json
  {"choices":[{"message":{"content":"","role":"assistant"},"finish_reason":"length"}],"usage":{"prompt_tokens":18,"completion_tokens":50,"total_tokens":68}}
  ```
- **Status**: Open (ModelScope 端问题)

### BUG-005: ~~MiniMax-M2.5 模型返回 400 错误~~ → 已恢复
- **Severity**: ~~High~~ → Low (已恢复)
- **Component**: Model integration (modelscope provider)
- **Description**: ~~API 返回 HTTP 400，响应体缺少 `choices` 字段~~ → **已恢复**: 当前测试中 MiniMax-M2.5 可以正常返回内容。但发现新问题：`reasoning_content` 字段泄漏了完整的内部推理链（454 tokens），包括思考过程和决策分析。
- **New issue**: reasoning_content 泄漏 — 见 BUG-018
- **Status**: Resolved ✅ (API 正常)，降级为 BUG-018

### BUG-018: ModelScope 模型 `reasoning_content` 推理链泄漏
- **Severity**: High
- **Component**: Model integration (modelscope provider / gateway response processing)
- **Reproduction**: 通过 ModelScope API 调用 `ZhipuAI/glm-5` 或 `MiniMax/MiniMax-M2.5`
- **Description**: 多个 ModelScope 模型在非 streaming 模式下的 `choices[0].message.reasoning_content` 字段包含了完整的内部推理过程文本（数百 tokens），这些内容应仅在 `stream: true` + 推理模型场景下出现。在普通 chat completion 中泄漏推理链会导致：
  1. `completion_tokens` 计数虚高（GLM-5：实际回答 7 tokens，reasoning 60 tokens）
  2. 响应体积膨胀，增加传输开销
  3. 可能向终端用户暴露内部推理细节
- **Affected models**:
  - `ZhipuAI/glm-5` — reasoning_content 包含思考步骤（如 "1. Identify the core question..."）
  - `MiniMax/MiniMax-M2.5` — reasoning_content 包含完整的决策分析过程（454 tokens）
- **GLM-5 streaming 行为**: 在 streaming 模式下，推理内容通过 `delta.reasoning_content` 逐步发送，但每个 chunk 的 `message.reasoning_content` 为空字符串（字段不一致）
- **Status**: Open

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

### BUG-019: Oxlint 发现 1147 个代码质量问题
- **Severity**: Medium
- **Component**: 代码质量 (全局)
- **Reproduction**: 执行 `pnpm lint`（运行 oxlint v1.58.0）
- **Description**: 对 3189 个源文件运行 oxlint 检查，发现 1147 个 error（0 warning）。主要是三种类型：
  - `typescript-eslint(no-explicit-any)`: 1052 处 — 大量使用 `any` 类型，缺乏类型安全
  - `eslint(curly)`: 49 处 — 单行 if 语句缺少花括号
  - `eslint(no-unused-vars)`: 40 处 — 未使用的变量声明
- **Impact**: 不影响运行，但严重影响代码可维护性和类型安全性。`no-explicit-any` 占比 91.7%。
- **Status**: Open

### BUG-020: Gateway Lite 模式下 `/v1/*` API 端点不可用
- **Severity**: Medium
- **Component**: Gateway routing (Lite mode)
- **Reproduction**: 在 Lite 模式网关运行时，访问 `/v1/chat/completions`、`/v1/models` 等端点
- **Description**: Lite 模式下 OpenAI-compatible API 路由（`/v1/chat/completions`、`/v1/models`）返回 `{"error":"not found"}`。API 端点仅在 Full 模式下可用。但 `/healthz` 和 `/health` 在 Lite 模式下已可用（v2026.5.9 修复）。
- **Status**: Open

---

## Low

### BUG-011: Vitest 默认 glob 不匹配 .suite.ts 测试文件
- **Severity**: Low
- **Component**: Test configuration
- **Description**: 项目使用 `.suite.ts` 后缀命名集成测试文件（如 `server.auth.modes.suite.ts`），但 Vitest 默认只匹配 `*.{test,spec}.?(c|m)[jt]s?(x)`，导致这些测试无法通过 `pnpm vitest run` 执行。
- **Affected files**:
  - `src/gateway/server.auth.modes.suite.ts` (5.4 KB)
  - `src/gateway/server.auth.control-ui.suite.ts` (44.4 KB)
  - `src/gateway/server.auth.default-token.suite.ts` (15.4 KB)
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

### BUG-022: `PluginErrorType` 缺少 `"unload"` 变体
- **Severity**: Low
- **Component**: `src/plugins/plugin-error-handler.ts` / `src/plugins/plugin-hot-reload.ts`
- **Reproduction**: `npx tsgo` 类型检查
- **Description**: `PluginErrorType` 联合类型仅定义了 `load | runtime | hook | channel | provider | tool | command`，但 `plugin-hot-reload.ts:321` 在记录卸载错误时使用了 `type: "unload"`，导致类型不匹配（TS2820）。
- **Error**:
  ```
  src/plugins/plugin-hot-reload.ts(321,9): error TS2820: Type '"unload"' is not assignable to type 'PluginErrorType'. Did you mean '"load"'?
  ```
- **Fix suggestion**: 在 `PluginErrorType` 中添加 `"unload"` 变体
- **Status**: Open

### BUG-023: `server-lite-ws.ts` 存在 8 个 TypeScript 类型错误
- **Severity**: Low
- **Component**: `src/gateway/server-lite-ws.ts`
- **Reproduction**: `npx tsgo` 类型检查
- **Description**: Lite 模式 WebSocket 处理器存在多个类型错误，包括：模块导入作为类型使用（TS1340）、缺少模块声明（TS2307: `../chat-abort.js`、`../../wizard/session.js`）、对象类型上缺少属性（`getModelCatalog`、`channelAccounts`）、HealthSummary 类型不匹配、隐式 any 参数。
- **Errors**:
  ```
  server-lite-ws.ts(719,37): error TS1340: Module './server-methods.js' does not refer to a type
  server-lite-ws.ts(766,55): error TS2307: Cannot find module '../chat-abort.js'
  server-lite-ws.ts(774,49): error TS2307: Cannot find module '../../wizard/session.js'
  server-lite-ws.ts(794,22): error TS2339: Property 'getModelCatalog' does not exist on type '{}'
  server-lite-ws.ts(800,40): error TS2322: Promise type mismatch (HealthSummary)
  server-lite-ws.ts(883,31): error TS2741: Missing 'channelAccounts' in ChannelRuntimeSnapshot
  server-lite-ws.ts(961,26): error TS7006: Parameter 'p' implicitly has an 'any' type
  ```
- **Impact**: 不影响运行时（tsdown 构建正常），但说明 Lite WS 模块类型定义不完整
- **Status**: Open

### BUG-024: UI 组件 `AppViewState` 缺少 `validation` 属性 — 72 个类型错误
- **Severity**: Low
- **Component**: `ui/src/ui/app-render.ts` / `ui/src/ui/app-settings.ts`
- **Reproduction**: `npx tsgo` 类型检查
- **Description**: `AppViewState` 和 `OpenClawApp` 类型缺少 `ConfigState` 要求的 `validation` 属性。`app-render.ts` 中约 72 处报 TS2741 错误（Property 'validation' missing），`app-settings.ts` 中 6 处。同时 `ConfigProps` 缺少 `validationResult` 和 `validationInProgress` 属性（TS2739）。可能是因为 Config validation 功能（commit 18fa66b4）添加后，UI 类型未同步更新。
- **Status**: Open

### BUG-021: Gateway Lite 模式 `/` 和 `/canvas` 返回 503
- **Severity**: Low
- **Component**: Gateway Lite Server / Static assets
- **Reproduction**: 启动 Lite 模式后访问 `http://127.0.0.1:18789/` 和 `/canvas`
- **Description**: 根路径 `/` 和 `/canvas` 返回 HTTP 503，错误消息为 "Control UI assets not found. Build them with `pnpm ui:build`"。即使已执行 `pnpm ui:build` 成功（42 chunks in 1.35s），Lite 模式仍不提供 UI 资源服务。UI 资源仅在 Full 模式下通过控制面板提供服务。
- **Status**: Open

---

## Test Results Summary

> Comprehensive check performed on 2026-04-07T09:30:00+08:00

| Test Category | Result | Details |
|---|---|---|
| `pnpm install` | PASS | 1160 packages installed |
| `pnpm build` | PASS | v2026.5.9, all steps including plugin-sdk:dts |
| `pnpm ui:build` | PASS | Vite build OK (42 chunks, 1.35s) |
| `pnpm lint` (oxlint) | **WARN** | 1147 errors: 1052 no-explicit-any, 49 curly, 40 no-unused-vars (BUG-019) |
| `pnpm vitest run` | **FAIL** | 1 failed suite: lazy-registry.test.ts empty (BUG-012); 3 suite files skipped (BUG-011) |
| `npx tsc --noEmit` | **FAIL** | OOM crash — heap limit exceeded (BUG-017) |
| Gateway Lite startup | PASS | 30ms kernel ready, ~7s full module init |
| `/healthz` (Lite) | PASS ✅ | Returns full status with 16 modules (was FAIL in v2026.5.8) |
| `/health` (Lite) | PASS ✅ | Same as /healthz |
| `/readyz` (Lite) | **FAIL** | Returns `{"error":"not found"}` (BUG-002) |
| `/ready` (Lite) | **FAIL** | Returns `{"error":"not found"}` (BUG-002) |
| `/` root (Lite) | **FAIL** | HTTP 503, UI assets not served (BUG-021) |
| `/canvas` (Lite) | **FAIL** | HTTP 503, UI assets not served (BUG-021) |
| `/v1/chat/completions` (Lite) | **FAIL** | Returns `{"error":"not found"}` (BUG-020) |
| `/v1/models` (Lite) | **FAIL** | Returns UI not found message (BUG-020) |
| `npx tsgo` (Go type checker) | **WARN** | 93 type errors: 13 in src/ (BUG-022,023), 80 in ui/src/ (BUG-024) |
| `stableclaw models list` | PASS | Shows 2 models: step-3.5-flash, glm5 |
| `stableclaw status` | PASS | Full status report, gateway connection OK |
| `stableclaw doctor` | WARN | 5 warnings (BUG-006,007,009,010,014) |
| `stableclaw security audit` | PASS | 0 critical, 1 warn (trusted proxies), 1 info |
| ModelScope GLM-5 | PASS ⚠️ | Returns valid content, but reasoning_content leaks (BUG-018) |
| ModelScope Kimi-K2.5 | PASS | Returns valid response: "Hello there, nice to meet you!" |
| ModelScope Step-3.5-Flash | **FAIL** | Empty content, finish_reason=length (BUG-004) |
| ModelScope MiniMax-M2.5 | PASS ⚠️ | Returns valid content (was 400 error), but reasoning_content leaks 454 tokens (BUG-018) |
| Plugin SDK exports | PASS | 4 required exports verified |

### Bug Statistics

| Severity | Count | Open | Fixed |
|---|---|---|---|
| Critical | 4 | 3 | 1 (BUG-016) |
| High | 5 | 5 | 0 |
| Medium | 6 | 6 | 0 |
| Low | 10 | 10 | 0 |
| **Total** | **25** | **24** | **1** |
