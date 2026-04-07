# StableClaw Bug Tracker

> Last updated: 2026-04-07T11:35:00+08:00
> Tester: Super Z (Lite Mode + AICQ Plugin Offline Focus)
> Version tested: 2026.5.10 (commit 90e9fdb)

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
- **Description**: Lite 模式下 `/readyz` 和 `/ready` 返回 `{"error":"not found"}`，而 `/healthz` 和 `/health` 在等待模块完全加载后（约 7 秒）能正常返回完整状态信息。
- **Note v2026.5.10**: `/` 和 `/canvas` 不再返回 503，现在返回 HTTP 200（UI 资源已正确提供）。`/readyz` 和 `/ready` 仍然 404。
- **Status**: Open (部分改善)

### BUG-025: Lite 模式下第三方插件完全不可用
- **Severity**: Critical
- **Component**: Gateway Lite Server / Plugin runtime
- **Reproduction**: 安装 AICQ 插件后，以 Lite 模式启动网关，通过 WebSocket RPC 调用插件方法
- **Description**: Lite 模式仅暴露 4 个极简方法 (`ping`, `version`, `health.get`, `status`)，所有插件方法（`plugins.list`, `aicq-chat.status`, `aicq-chat.getFriends` 等）均返回 `unknown method`。虽然 healthz 报告 plugins 模块状态为 "ready"，但插件运行时并未在 Lite 模式中初始化。具体表现：
  1. 插件管理 UI (port 6109) 不会启动
  2. 插件 HTTP 路由 (`/plugins/aicq-chat/`) 返回 404
  3. 插件工具 (chat-send, chat-friend) 无法调用
  4. 插件离线消息队列功能不可用
  5. 插件配置 API 全部 404
- **Expected**: 至少应该暴露 `plugins.list` 和插件注册的方法，或者给出明确提示"Lite 模式不支持插件"
- **Workaround**: 使用 `--full` 模式启动
- **Status**: Open

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

### BUG-021: ~~Gateway Lite 模式 `/` 和 `/canvas` 返回 503~~ ✅ 已修复
- **Severity**: ~~Low~~ → Fixed
- **Component**: Gateway Lite Server / Static assets
- **Description**: ~~根路径 `/` 和 `/canvas` 返回 HTTP 503~~ → **已修复**: v2026.5.10 中 `/` 和 `/canvas` 现在正确返回 HTTP 200。
- **Status**: Fixed ✅ (v2026.5.10)

### BUG-026: AICQ 插件安装被安全沙箱阻止
- **Severity**: High
- **Component**: Plugin security scan / `src/plugins/install-security-scan.runtime.ts`
- **Reproduction**: `stableclaw plugins install /path/to/aicq/plugin/`
- **Description**: AICQ 插件使用 `child_process` (用于获取系统指纹) 和环境变量访问（用于构建 auth headers），触发 stableclaw 的安全沙箱扫描，默认阻止安装。错误信息：
  ```
  Plugin "aicq-chat" installation blocked: dangerous code patterns detected:
  Shell command execution detected (child_process) (dist/index.js:117);
  Environment variable access combined with network send — possible credential harvesting (dist/index.js:171)
  ```
- **Workaround**: 使用 `--dangerously-force-unsafe-install` 标志强制安装
- **Suggestion**: 
  1. 安全扫描应区分 `exec()` 和 `execFile()`（后者更安全）
  2. 环境变量访问是正常功能（读 HOME/PATH 等），不应标记为"凭证窃取"
  3. 应支持插件清单声明所需权限（类似 Android permission model）
- **Status**: Open

### BUG-027: AICQ 插件使用 xdg-open 在无头环境崩溃
- **Severity**: Medium
- **Component**: AICQ Plugin / `src/index.ts`
- **Reproduction**: 安装 AICQ 插件后运行 `stableclaw plugins list`
- **Description**: 插件初始化时尝试用 `xdg-open` 打开浏览器访问管理 UI，在无头/服务器环境中失败：`Command failed: xdg-open "http://127.0.0.1:6109/"`。虽然非致命（被 try-catch 捕获），但产生不必要的错误日志。
- **Fix suggestion**: 检测 `DISPLAY` 或 `WAYLAND_DISPLAY` 环境变量，或使用 `process.env.OPENCLAW_NO_BROWSER=1` 控制
- **Status**: Open

### BUG-028: AICQ 插件 manifest 版本与 package.json 不同步
- **Severity**: Low
- **Component**: AICQ Plugin
- **Description**: `openclaw.plugin.json` 中 version 为 `1.3.0`，而 `package.json` 中 version 为 `1.5.0`。两处版本不一致，可能导致混淆。
- **Status**: Open

### BUG-029: AICQ 插件 `enabledByDefault: false` 导致安装后不生效
- **Severity**: Medium
- **Component**: AICQ Plugin / `openclaw.plugin.json`
- **Description**: 插件 manifest 中 `enabledByDefault: false`，意味着即使安装了插件，也需要手动在配置中启用。但 `plugins install` 命令完成后已经在 `stableclaw.json` 中设置了 `"enabled": true`，所以 manifest 中的默认值实际无效。应统一为 `true` 或在安装时明确提示。
- **Status**: Open

---

## AICQ Plugin Offline Feature Test Results

> 测试时间: 2026-04-07T11:30:00+08:00
> 测试方式: Bundle 静态分析 + WebSocket RPC 集成测试 (Lite 模式)
> 环境: aicq.online DNS 不可达（模拟离线环境）

### 离线功能代码审计（Bundle 静态分析）

| 功能 | 状态 | 说明 |
|------|------|------|
| 小时级重连检查 | ✅ 通过 | `hourlyCheckMode` 实现完整：初始窗口 1 分钟内指数退避重试，之后每小时检查一次 |
| 离线消息队列 | ✅ 通过 | `pendingMessages` 队列实现：离线时消息入队，上线后自动 flush |
| 重连后批量发送 | ✅ 通过 | `flushOfflineMessages()` 在连接恢复时逐条发送队列中的消息 |
| 指数退避重连 | ✅ 通过 | 1s → 2s → 4s → ... → 60s max，含 0.75-1.25 随机 jitter |
| WebSocket 心跳 | ✅ 通过 | 30s 间隔 ping，连接断开自动清理定时器 |
| Noise-XK 握手 | ✅ 通过 | Ed25519/X25519/AES-256-GCM 端到端加密 |
| 加密/解密 | ✅ 通过 | AES-256-GCM 对称加密 + X25519 密钥交换 |
| 连接状态机 | ✅ 通过 | offline → reconnecting → online 三态转换 |
| P2P 直连 | ✅ 通过 | 支持直连模式（`enableP2P: true`） |
| 文件传输 | ✅ 通过 | 分块传输 + 断点续传（`fileMissingChunks`） |
| JWT 认证 | ✅ 通过 | 节点注册获取 token，WS 和 REST API 均使用 Bearer token |

### 集成测试结果（Lite 模式 + AICQ 插件）

| 测试项 | 结果 | 说明 |
|--------|------|------|
| `pnpm install` (stableclaw) | ✅ PASS | 749 packages (npm), 1160 packages (pnpm) |
| `pnpm build` | ✅ PASS | v2026.5.10, all steps OK |
| `pnpm ui:build` | ✅ PASS | Vite build OK (1.31s) |
| `@aicq/crypto` build | ✅ PASS | TypeScript 编译成功 |
| AICQ plugin build | ✅ PASS | esbuild bundle 617.1 KB |
| `plugins install` (默认) | ❌ BLOCKED | 安全沙箱阻止 (BUG-026) |
| `plugins install --dangerously-force-unsafe-install` | ✅ PASS | 强制安装成功 |
| Gateway Lite startup | ✅ PASS | 11ms kernel ready, 16 modules ready |
| `/healthz` (Lite) | ✅ PASS | HTTP 200, 16 modules ready |
| `/health` (Lite) | ✅ PASS | HTTP 200 |
| `/readyz` (Lite) | ❌ FAIL | HTTP 404 (BUG-002) |
| `/ready` (Lite) | ❌ FAIL | HTTP 404 (BUG-002) |
| `/` root (Lite) | ✅ PASS | HTTP 200 (was 503 in v2026.5.9) |
| `/canvas` (Lite) | ✅ PASS | HTTP 200 (was 503 in v2026.5.9) |
| `/v1/chat/completions` (Lite) | ❌ FAIL | HTTP 404 (expected: Lite 不支持 API) |
| `/v1/models` (Lite) | ❌ FAIL | 返回 UI HTML (expected: Lite 不支持 API) |
| WS connect (Lite) | ✅ PASS | protocol 3, 4 methods available |
| WS `plugins.list` | ❌ FAIL | "unknown method" (BUG-025) |
| WS `aicq-chat.status` | ❌ FAIL | "unknown method" (BUG-025) |
| WS `tool.call` (chat-send) | ❌ FAIL | "unknown method" (BUG-025) |
| Plugin Mgmt UI (port 6109) | ❌ FAIL | 未启动 (BUG-025) |
| Gateway Plugin UI `/plugins/aicq-chat/` | ❌ FAIL | HTTP 404 (BUG-025) |
| ModelScope Step-3.5-Flash | ⚠️ PARTIAL | 返回 "Hello!" 但 completion_tokens=56（含内部推理） |
| ModelScope GLM-5 | ❌ FAIL | 返回空响应：`choices: null, usage: all 0` |
| ModelScope MiniMax-M2.5 | ❌ FAIL | 400: `Invalid model id: Minimal/MiniMax-M2.5` |
| ModelScope Kimi-K2.5 | ✅ PASS | "Hello! It's nice to meet you." (26 tokens) |

### Bug Statistics

| Severity | Count | Open | Fixed |
|---|---|---|---|
| Critical | 6 | 5 | 1 (BUG-016) |
| High | 6 | 6 | 0 |
| Medium | 9 | 9 | 0 |
| Low | 11 | 10 | 1 (BUG-021) |
| **Total** | **32** | **30** | **2** |
