# 🦞 StableClaw — 企业级稳定版 AI 助手

<p align="center">
  <img src="assets/stableclaw-icon.svg" alt="StableClaw Logo" width="120">
</p>

<p align="center">
  <a href="https://github.com/ctz168/stableclaw"><img src="https://img.shields.io/github/actions/workflow/status/ctz168/stableclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/stableclaw"><img src="https://img.shields.io/npm/v/stableclaw?style=for-the-badge&label=npm" alt="npm version"></a>
  <a href="https://github.com/ctz168/stableclaw/releases"><img src="https://img.shields.io/github/v/release/ctz168/stableclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

## 📋 项目简介

**StableClaw** 是基于 [OpenClaw](https://github.com/openclaw/openclaw) **v2026.4.3** 版本的**企业级稳定增强版**，专注于生产环境的稳定性、可靠性和可维护性。

StableClaw 在 OpenClaw 的基础上，增加了多项企业级增强功能，特别适合需要高可用性、零停机维护和自动化运维的生产环境。支持 **20+ 消息渠道**（Telegram、Discord、Slack、微信、WhatsApp 等）、**多 AI 模型**（OpenAI、Anthropic、Google、Moonshot/Kimi、DeepSeek 等）以及 **85+ 扩展插件**。

---

## 🚀 一键安装

> 💡 **无需手动安装 Node.js、Git 等依赖**，脚本会自动检测并安装所有前置条件。仅复制一行命令即可完成安装。

### Windows（PowerShell）

```powershell
powershell -c "irm https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.ps1 | iex"
```

> 首次运行时如果 PowerShell 提示执行策略限制，先执行：`Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.sh | bash
```

### 安装脚本高级选项

两个平台脚本均支持以下参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--tag=VERSION` / `-Tag VERSION` | `latest` | 指定 npm 版本标签（如 `2026.4.5`、`beta`） |
| `--install-method=npm` / `-InstallMethod npm` | `npm` | 安装方式：`npm` 或 `git` |
| `--no-onboard` / `-NoOnboard` | 否 | 跳过首次交互式配置向导 |
| `--dry-run` / `-DryRun` | 否 | 仅显示将要执行的操作，不实际安装 |

**示例：**

```powershell
# Windows — 安装指定版本，跳过向导
powershell -c "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.ps1))) -Tag 2026.4.5 -NoOnboard"

# Linux/macOS — 从源码安装
curl -fsSL https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.sh | bash -s -- --install-method git
```

---

## 📋 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| **操作系统** | Windows 10 / macOS 12 / Ubuntu 20.04 | Windows 11 / macOS 14 / Ubuntu 24.04 |
| **内存** | 512 MB | 2 GB+ |
| **磁盘空间** | 200 MB | 500 MB+ |

> 安装脚本会自动检测并安装 Node.js 22+，你不需要提前准备任何环境。

---

## ⚙️ 安装后配置

安装完成后，首次运行需要进行配置。如果安装时跳过了向导（`--no-onboard`），可以手动执行。

### 1. 运行配置向导（推荐）

配置向导会交互式地引导你完成所有必要设置：

```bash
stableclaw onboard
```

向导会依次配置以下内容：

- **AI 模型提供商** — 选择并配置 AI 模型（OpenAI、Anthropic、Google 等）
- **API Key** — 输入对应服务商的 API 密钥
- **默认模型** — 选择默认使用的模型（如 GPT-4o、Claude 3.5 Sonnet）
- **消息渠道** — 配置连接的消息平台（Telegram、Discord、Slack 等）
- **Agent** — 配置 AI 助手的行为和参数

### 2. 安装守护进程（可选）

守护进程可以让 StableClaw 在后台持续运行，即使关闭终端也不会停止：

```bash
# 安装并启动守护进程
stableclaw onboard --install-daemon

# 或者单独安装
stableclaw daemon install
```

### 3. 手动配置

如果你跳过了配置向导，可以手动编辑配置文件：

```bash
# 配置文件位置
~/.stableclaw/stableclaw.json    # Linux / macOS
%USERPROFILE%\.stableclaw\stableclaw.json   # Windows
```

**最小配置示例：**

```json
{
  "gateway": {
    "port": 18789
  },
  "providers": {
    "openai": {
      "apiKey": "sk-xxxxxxxxxxxxxxxx"
    }
  },
  "defaults": {
    "model": "gpt-4o"
  }
}
```

**配置文件目录结构：**

```
~/.stableclaw/
├── stableclaw.json          # 主配置文件
├── credentials/             # API 密钥和安全凭证（加密存储）
│   ├── openai.json
│   ├── anthropic.json
│   └── ...
├── extensions/              # 已安装的第三方插件
├── agents/                  # Agent 配置（自定义 AI 助手行为）
│   └── default.json
├── memory/                  # 对话记忆持久化存储
│   └── conversations/
├── sessions/                # 会话数据
└── logs/                    # 运行日志
    └── gateway.log
```

### 4. 配置 AI 模型提供商

StableClaw 支持多种 AI 模型提供商，你可以同时配置多个并随时切换：

```bash
# 配置 OpenAI
stableclaw models set openai --api-key sk-xxxxx

# 配置 Anthropic（Claude）
stableclaw models set anthropic --api-key sk-ant-xxxxx

# 配置 Google Gemini
stableclaw models set google --api-key xxxx

# 配置 Moonshot / Kimi
stableclaw models set moonshot --api-key xxxx

# 配置 DeepSeek
stableclaw models set deepseek --api-key xxxx

# 查看已配置的模型
stableclaw models list

# 设置默认模型
stableclaw models default gpt-4o
```

> **API Key 获取地址：**
> - OpenAI：https://platform.openai.com/api-keys
> - Anthropic：https://console.anthropic.com/settings/keys
> - Google：https://aistudio.google.com/app/apikey
> - Moonshot：https://platform.moonshot.cn/console/api-keys
> - DeepSeek：https://platform.deepseek.com/api_keys

### 5. 配置消息渠道

连接消息平台，让 AI 助手可以通过各种渠道与用户交互：

```bash
# 添加 Telegram 渠道
stableclaw channels add telegram

# 添加 Discord 渠道
stableclaw channels add discord

# 添加 Slack 渠道
stableclaw channels add slack

# 查看所有已配置的渠道
stableclaw channels

# 测试渠道连接
stableclaw doctor
```

每个渠道都需要对应平台的 Bot Token 或 API 凭证，配置过程中会有详细指引。

---

## 🏃 日常使用

### 启动和停止

```bash
# 前台运行（适合开发调试，日志直接输出到终端）
stableclaw gateway run

# 后台运行（守护进程模式，适合生产部署）
stableclaw gateway start

# 查看运行状态
stableclaw status

# 停止 gateway
stableclaw gateway stop

# 重启 gateway
stableclaw gateway restart
```

### 常用命令速查

```bash
# ── 基础操作 ──
stableclaw --version              # 查看版本
stableclaw --help                 # 查看帮助
stableclaw status                 # 查看完整运行状态
stableclaw doctor                 # 诊断问题和检查配置

# ── 模型管理 ──
stableclaw models list            # 列出所有可用模型
stableclaw models default <name>  # 设置默认模型
stableclaw models scan            # 扫描并发现可用模型

# ── 渠道管理 ──
stableclaw channels               # 查看已配置渠道
stableclaw channels add <name>    # 添加渠道
stableclaw channels remove <name> # 移除渠道

# ── Agent 管理 ──
stableclaw agents                 # 查看 Agent 列表
stableclaw agents add <name>      # 添加 Agent
stableclaw agents remove <name>   # 移除 Agent

# ── 插件管理 ──
stableclaw plugins list           # 查看已安装插件
stableclaw plugin install <name>  # 安装插件
stableclaw plugin remove <name>   # 卸载插件

# ── 配置管理 ──
stableclaw configure              # 交互式配置
stableclaw config get <key>       # 查看配置项
stableclaw config set <key> <val> # 修改配置项

# ── Web 控制面板 ──
# 启动后访问 http://localhost:18789 打开 Web UI
```

### Web 控制面板

StableClaw 内置 Web 控制面板，启动 gateway 后自动可用：

- **地址：** http://localhost:18789
- **功能：** 实时查看消息、管理渠道、配置 Agent、查看日志、系统监控
- **端口修改：** 在 `stableclaw.json` 中设置 `gateway.port` 值

---

## 🔄 更新升级

重新运行一键安装命令即可完成升级，脚本会自动检测已有安装并执行更新：

```powershell
# Windows
powershell -c "irm https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.ps1 | iex"
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.sh | bash
```

也可以使用安装脚本的 `--tag` 参数升级到指定版本：

```powershell
# Windows — 升级到指定版本
powershell -c "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.ps1))) -Tag 2026.4.6"

# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.sh | bash -s -- --tag 2026.4.6
```

---

## 🗑️ 卸载

```bash
# 卸载 StableClaw
npm uninstall -g stableclaw

# 可选：删除配置和数据（谨慎操作！会清除所有对话记录和设置）
rm -rf ~/.stableclaw           # Linux / macOS
Remove-Item -Recurse "$env:USERPROFILE\.stableclaw"  # Windows PowerShell
```

---

## 🔁 从 OpenClaw 迁移

如果你之前使用 OpenClaw，可以一键迁移到 StableClaw，所有配置、插件、凭证和对话记录都会保留：

```bash
# 预览迁移（安全模式，不修改任何文件）
stableclaw migrate from-openclaw --dry-run

# 执行迁移并自动创建备份
stableclaw migrate from-openclaw --create-backup

# 手动指定 OpenClaw 目录
stableclaw migrate from-openclaw --openclaw-dir ~/.openclaw
```

**迁移内容包括：** 配置文件、插件目录、API 凭证、身份认证、对话记忆、Agent 配置、渠道数据（Telegram/Discord/Slack 等）。

| 选项 | 说明 |
|------|------|
| `--dry-run` | 仅预览，不修改任何文件 |
| `--create-backup` | 迁移前创建完整备份 |
| `--skip-plugins` | 跳过插件迁移 |
| `--skip-credentials` | 跳过 API 凭证迁移 |
| `--skip-logs` | 跳过日志迁移 |
| `--force` | 强制覆盖已有数据 |
| `--openclaw-dir <path>` | 指定 OpenClaw 配置目录路径 |

---

## 🌟 StableClaw 核心特色

### 1. 🔄 配置热重载安全机制

**问题：** OpenClaw 原版在配置文件修改后，如果配置无效会导致 gateway 崩溃或拒绝启动。

**StableClaw 解决方案：**

- ✅ **配置状态持久化** — 跟踪配置有效性状态，维护最后有效配置快照
- ✅ **自动回滚机制** — 配置无效时自动回滚到上一个有效配置
- ✅ **详细错误诊断** — 提供智能修复建议和错误位置定位
- ✅ **零停机配置更新** — 配置错误不影响 gateway 运行

```bash
# 修改配置文件（即使出错也不影响运行）
$ vim ~/.stableclaw/stableclaw.json

# Gateway 自动检测配置错误并回滚
⚠️  Last configuration change was invalid. Gateway will start with the last valid configuration.
   Error: Invalid type. Expected "string" but received "undefined" at "gateway.port"
   Suggestion: Add a string value for "gateway.port" in your configuration file.
```

### 2. 🔒 严格单例模式

**问题：** OpenClaw 原版可能启动多个 gateway 实例，导致端口冲突、资源浪费和状态混乱。

**StableClaw 解决方案：**

- ✅ **全局单例锁** — 强制严格单例运行
- ✅ **立即失败模式** — 已有实例时立即拒绝，不等待
- ✅ **僵尸进程处理** — 自动检测和处理残留进程

```bash
$ stableclaw gateway run      # 第一次启动 ✓
$ stableclaw gateway run      # 第二次启动 ✗ 立即失败
✗ Error: gateway already running (pid 12345)
  Use 'stableclaw gateway stop' to stop it before starting a new instance.
```

### 3. 🔌 插件热插拔机制

- ✅ 安装插件后自动热加载，无需重启 gateway
- ✅ 插件错误自动隔离，不影响 gateway 运行
- ✅ 定期健康检查，自动恢复临时性问题

### 4. 🛡️ 企业级稳定性

- ✅ 全局错误捕获和自动隔离
- ✅ 详细错误日志和诊断信息
- ✅ 自动恢复机制

---

## ❓ 常见问题 FAQ

<details>
<summary><strong>安装相关</strong></summary>

**Q: 一键安装报错怎么办？**

A: 确保网络可以访问 GitHub 和 npm registry。如果 PowerShell 提示执行策略限制，先执行 `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`。Linux/macOS 如果 npm 权限不足，脚本会自动提示处理方式。

**Q: 安装后执行 stableclaw 提示 command not found？**

A: 关闭当前终端，重新打开一个新终端再试。脚本会自动将 npm 全局 bin 目录添加到 PATH，但需要新终端才能生效。

**Q: 支持 Node.js 20 吗？**

A: 不支持。StableClaw 最低要求 Node.js v22.12，安装脚本会自动安装满足要求的版本。

**Q: 想从源码构建怎么办？**

A: 一键安装脚本支持 `--install-method=git` 参数，会自动完成克隆、安装依赖、构建、创建全局命令的全部流程。

</details>

<details>
<summary><strong>运行相关</strong></summary>

**Q: gateway 启动后怎么停止？**

A: 前台运行按 `Ctrl+C`。后台守护进程模式执行 `stableclaw gateway stop`。

**Q: 端口 18789 被占用怎么办？**

A: 修改 `~/.stableclaw/stableclaw.json` 中的 `gateway.port` 为其他端口，或者停止占用该端口的程序。也可以执行 `lsof -i :18789`（macOS/Linux）或 `netstat -ano | findstr 18789`（Windows）查看占用进程。

**Q: 如何让 StableClaw 开机自启动？**

A: 执行 `stableclaw daemon install` 安装守护进程，它会在系统启动时自动运行 gateway。

**Q: 支持哪些 AI 模型？**

A: 支持 OpenAI（GPT-4o、GPT-4、GPT-3.5）、Anthropic（Claude 3.5 Sonnet、Claude 3 Opus）、Google（Gemini Pro/Flash）、Moonshot/Kimi、DeepSeek、Ollama（本地模型）等。执行 `stableclaw models list` 查看完整列表。

</details>

<details>
<summary><strong>配置相关</strong></summary>

**Q: 配置文件在哪里？**

A: Linux/macOS：`~/.stableclaw/stableclaw.json`。Windows：`%USERPROFILE%\.stableclaw\stableclaw.json`。

**Q: API Key 安全吗？**

A: API Key 存储在 `credentials/` 目录下，使用加密存储。不要将 `~/.stableclaw/` 目录提交到 Git 或分享给他人。

**Q: 如何同时使用多个 AI 模型？**

A: 在配置文件中配置多个 provider，然后为不同的 Agent 设置不同的默认模型，或在对话中临时切换。

</details>

---

## 🆚 与 OpenClaw 对比

| 特性 | OpenClaw 原版 | StableClaw |
|------|---------------|------------|
| 配置热重载 | ✅ 支持 | ✅ 支持 + 安全回滚 |
| 配置错误处理 | ⚠️ 可能崩溃 | ✅ 自动回滚，零停机 |
| 多实例防护 | ⚠️ 可能启动多个 | ✅ 严格单例，立即失败 |
| 插件安装/卸载 | ⚠️ 需要重启 | ✅ 热插拔，零停机 |
| 插件错误处理 | ⚠️ 可能崩溃 | ✅ 自动隔离和禁用 |
| 健康监控 | ❌ 无 | ✅ 定期检查 + 自动恢复 |
| 一键迁移 | ❌ 无 | ✅ OpenClaw 一键迁移 |
| npm 安装 | ❌ 无 | ✅ `npm i -g stableclaw` |
| 企业级稳定性 | ⚠️ 个人使用 | ✅ 生产环境就绪 |

---

## 📖 文档与资源

- [StableClaw 官方文档](https://docs.stableclaw.ai)
- [npm 包页面](https://www.npmjs.com/package/stableclaw)
- [更新日志](./CHANGELOG.md)
- [贡献指南](./CONTRIBUTING.md)
- [GitHub Issues](https://github.com/ctz168/stableclaw/issues)

---

## 🛠️ 开发者指南

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 类型检查
pnpm tsgo

# 代码检查
pnpm check

# 运行测试
pnpm test

# 测试覆盖率
pnpm test:coverage
```

### 项目结构

```
stableclaw/
├── src/
│   ├── config/                    # 配置管理（含热重载安全机制）
│   ├── gateway/                   # Gateway 核心（含单例锁、启动逻辑）
│   ├── plugins/                   # 插件系统（含热插拔、健康检查、错误隔离）
│   ├── channels/                  # 消息渠道（Telegram/Discord/Slack 等 20+）
│   ├── agents/                    # Agent 系统
│   ├── migration/                 # OpenClaw 迁移工具
│   ├── commands/                  # CLI 命令
│   ├── cli/                       # CLI 框架
│   ├── hooks/                     # Hook 系统
│   ├── infra/                     # 基础设施（锁、日志、工具）
│   └── security/                  # 安全审计
├── extensions/                    # 扩展插件（85+）
├── ui/                            # Web 控制面板
├── scripts/                       # 构建、部署、发布脚本
├── apps/                          # 桌面应用（macOS/iOS/Android）
├── docs/                          # 文档
└── packages/                      # 内部共享包
```

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

---

## 🙏 致谢

**StableClaw** 是基于 [OpenClaw](https://github.com/openclaw/openclaw) 项目的二次开发版本，感谢 OpenClaw 团队的出色工作！

### OpenClaw 原版特性

- 支持 20+ 消息渠道（Telegram、Discord、Slack、微信、WhatsApp 等）
- 多模型支持（OpenAI、Anthropic、Google、Moonshot/Kimi 等）
- 插件生态系统（85+ 扩展）
- 语音助手支持（macOS/iOS/Android）
- 实时画布渲染
- 端到端加密
