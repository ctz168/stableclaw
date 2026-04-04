# 🦞 StableClaw — 企业级稳定版 AI 助手

<p align="center">
  <strong>EXFOLIATE! EXFOLIATE!</strong>
</p>

<p align="center">
  <a href="https://github.com/ctz168/stableclaw"><img src="https://img.shields.io/github/actions/workflow/status/ctz168/stableclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/ctz168/stableclaw/releases"><img src="https://img.shields.io/github/v/release/ctz168/stableclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

## 📋 项目简介

**StableClaw** 是基于 [OpenClaw](https://github.com/openclaw/openclaw) **v2026.4.3** 版本的**企业级稳定增强版**，专注于生产环境的稳定性、可靠性和可维护性。

StableClaw 在 OpenClaw 的基础上，增加了多项企业级增强功能，特别适合需要高可用性、零停机维护和自动化运维的生产环境。

---

## 🚀 快速开始

### 系统要求

| 平台 | 要求 |
|------|------|
| **Node.js** | v24（推荐）或 v22.16+ |
| **pnpm** | v9+ |
| **Git** | 最新版 |
| **操作系统** | Windows 10/11、macOS 12+、Ubuntu 20.04+ / Debian 11+ |

---

### 🪟 Windows 安装（PowerShell）

**第一步：安装前置依赖**

打开 **PowerShell**（管理员），依次执行：

```powershell
# 1. 安装 Node.js（如果没有）
winget install OpenJS.NodeJS.LTS

# 关闭当前 PowerShell，重新打开一个新的，验证安装
node --version
# 应显示 v24.x.x 或 v22.16+

# 2. 安装 pnpm
npm install -g pnpm

# 3. 安装 Git（如果没有）
winget install Git.Git

# 关闭并重新打开 PowerShell
git --version
```

> 如果 `winget` 不可用，也可以从 [https://nodejs.org](https://nodejs.org) 手动下载 Node.js，从 [https://git-scm.com](https://git-scm.com) 下载 Git。

**第二步：修复 PowerShell 执行策略**

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**第三步：克隆并构建**

```powershell
# 克隆仓库
git clone https://github.com/ctz168/stableclaw.git
cd stableclaw

# 安装依赖
pnpm install

# 构建项目（可能需要几分钟）
pnpm build
```

**第四步：运行配置向导**

```powershell
# 首次运行配置向导（会引导你设置 AI 模型、API Key 等）
pnpm stableclaw onboard --install-daemon
```

**第五步：启动**

```powershell
# 启动 gateway
pnpm stableclaw gateway run

# 或者后台启动（守护进程模式）
pnpm stableclaw gateway start
```

**Windows 配置文件位置：**
```
C:\Users\<你的用户名>\.stableclaw\
├── stableclaw.json     # 主配置文件
├── credentials/        # API 密钥和凭证
├── extensions/         # 已安装的插件
├── agents/             # Agent 配置
└── memory/             # 对话记忆
```

**常见问题：**

| 问题 | 解决方案 |
|------|----------|
| `pnpm: 无法加载文件` | 执行 `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `node: command not found` | 重新打开 PowerShell，或手动添加 Node.js 到 PATH |
| `pnpm build` 报错 | 确认 Node.js 版本 >= 22.16，执行 `node --version` 检查 |
| 端口 18789 被占用 | 修改 `stableclaw.json` 中的 `gateway.port`，或执行 `pnpm stableclaw gateway stop` |

---

### 🍎 macOS 安装

```bash
# 安装 Homebrew（如果没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Node.js
brew install node@24

# 安装 pnpm
npm install -g pnpm

# 克隆、构建、运行
git clone https://github.com/ctz168/stableclaw.git
cd stableclaw
pnpm install
pnpm build

# 配置向导
pnpm stableclaw onboard --install-daemon

# 启动
pnpm stableclaw gateway run
```

**macOS 配置文件位置：**
```
~/.stableclaw/
├── stableclaw.json
├── credentials/
└── extensions/
```

---

### 🐧 Linux 安装（Ubuntu / Debian）

```bash
# 安装 Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm

# 安装构建工具
sudo apt-get install -y build-essential python3

# 克隆、构建、运行
git clone https://github.com/ctz168/stableclaw.git
cd stableclaw
pnpm install
pnpm build

# 配置向导
pnpm stableclaw onboard --install-daemon

# 启动
pnpm stableclaw gateway run
```

**Linux 配置文件位置：**
```
~/.stableclaw/
├── stableclaw.json
├── credentials/
└── extensions/
```

---

### 🐳 Docker 部署（可选）

```bash
# 克隆仓库
git clone https://github.com/ctz168/stableclaw.git
cd stableclaw

# 使用 Docker Compose
cp docker-compose.yml.example docker-compose.yml
# 编辑 docker-compose.yml 配置你的 API Key
docker compose up -d
```

---

## 🌟 StableClaw 核心特色

### 1. 🔄 配置热重载安全机制

**问题：** OpenClaw 原版在配置文件修改后，如果配置无效会导致 gateway 崩溃或拒绝启动。

**StableClaw 解决方案：**

- ✅ **配置状态持久化** — 跟踪配置有效性状态，维护最后有效配置快照
- ✅ **自动回滚机制** — 配置无效时自动回滚到上一个有效配置
- ✅ **详细错误诊断** — 提供智能修复建议和错误位置定位
- ✅ **零停机配置更新** — 配置错误不影响 gateway 运行

**使用示例：**

```bash
# 修改配置文件（即使出错也不影响运行）
$ vim ~/.stableclaw/stableclaw.json

# Gateway 自动检测配置错误
⚠️  Last configuration change was invalid. Gateway will start with the last valid configuration.
   Error: Invalid type. Expected "string" but received "undefined" at "gateway.port"
   Suggestion: Add a string value for "gateway.port" in your configuration file.
   Invalid config saved to: .invalid-config-2026-04-03T16-30-00.json
```

---

### 2. 🔒 严格单例模式

**问题：** OpenClaw 原版可能启动多个 gateway 实例，导致端口冲突、资源浪费和状态混乱。

**StableClaw 解决方案：**

- ✅ **全局单例锁** — `gateway.global.lock` 强制严格单例
- ✅ **立即失败模式** — 已有实例时立即拒绝，不等待
- ✅ **清晰错误提示** — 告知用户如何停止现有实例
- ✅ **进程状态检查** — 自动检测和处理僵尸进程
- ✅ **mDNS 缓存清理** — 停止时自动清理 Bonjour 缓存，避免重启时的名称冲突

**使用示例：**

```bash
# 第一次启动
$ pnpm stableclaw gateway run
✓ Gateway started on port 18789

# 第二次启动（立即失败）
$ pnpm stableclaw gateway run
✗ Error: gateway already running (pid 12345)
  Use 'stableclaw gateway stop' to stop it before starting a new instance.

# 停止 gateway（自动清理 mDNS 缓存）
$ pnpm stableclaw gateway stop
✓ Gateway stopped
✓ mDNS cache cleared
```

---

### 3. 🔌 插件热插拔机制

**问题：** OpenClaw 原版安装/卸载插件需要重启 gateway，插件错误可能导致 gateway 崩溃。

**StableClaw 解决方案：**

- ✅ **插件安装热重载** — 安装插件后自动加载，无需重启 gateway
- ✅ **插件卸载热卸载** — 卸载插件前自动清理，无需重启 gateway
- ✅ **插件错误隔离** — 插件错误自动禁用，不影响 gateway 运行
- ✅ **健康监控机制** — 定期检查插件健康状态，自动恢复临时性问题

**使用示例：**

```bash
# 安装插件（立即生效）
$ pnpm stableclaw plugin install my-plugin
Downloading my-plugin…
Installing to /path/to/extensions/my-plugin…
Plugin my-plugin hot-reloaded successfully
✓ Plugin installed and activated

# 插件错误自动隔离
[plugin-error] my-plugin (runtime/error): Hook execution failed
[plugin-disable] my-plugin disabled: Hook execution failed
[gateway] Gateway continues running (plugin "my-plugin" disabled)
```

---

### 4. 🛡️ 企业级错误处理

- ✅ **全局错误捕获** — 捕获未处理的异常和 Promise 拒绝
- ✅ **自动错误隔离** — 将错误限制在最小范围内
- ✅ **详细错误日志** — 记录完整的错误上下文和堆栈
- ✅ **自动恢复机制** — 尝试自动恢复临时性问题

---

### 5. 📊 健康监控和自动化运维

- ✅ **插件健康检查** — 定期检查插件状态（默认 1 分钟）
- ✅ **自动恢复机制** — 尝试恢复降级的插件
- ✅ **健康状态报告** — 提供插件健康状态查询接口
- ✅ **连续错误检测** — 自动禁用持续失败的插件

---

### 6. 🔄 一键迁移功能

**从 OpenClaw 迁移到 StableClaw：**

```bash
# 预览迁移（不修改文件）
pnpm stableclaw migrate from-openclaw --dry-run

# 执行迁移并创建备份
pnpm stableclaw migrate from-openclaw --create-backup

# 手动指定 OpenClaw 目录
pnpm stableclaw migrate from-openclaw --openclaw-dir ~/.openclaw
```

**迁移内容包括：** 配置文件、插件目录、API 凭证、身份认证、对话记忆、Agent 配置、渠道数据（Telegram/Discord/Slack 等）。

| 选项                 | 说明                     |
| -------------------- | ------------------------ |
| `--dry-run`          | 预览迁移，不修改文件     |
| `--skip-plugins`     | 跳过插件迁移             |
| `--skip-credentials` | 跳过凭证迁移             |
| `--skip-logs`        | 跳过日志迁移             |
| `--force`            | 强制迁移（覆盖现有数据） |
| `--create-backup`    | 创建备份                 |
| `--openclaw-dir`     | 手动指定 OpenClaw 目录   |

---

## 🆚 与 OpenClaw 对比

| 特性          | OpenClaw 原版   | StableClaw             |
| ------------- | --------------- | ---------------------- |
| 配置热重载    | ✅ 支持         | ✅ 支持 + 安全回滚     |
| 配置错误处理  | ⚠️ 可能崩溃     | ✅ 自动回滚，零停机    |
| 多实例防护    | ⚠️ 可能启动多个 | ✅ 严格单例，立即失败  |
| 插件安装/卸载 | ⚠️ 需要重启     | ✅ 热插拔，零停机      |
| 插件错误处理  | ⚠️ 可能崩溃     | ✅ 自动隔离和禁用      |
| 健康监控      | ❌ 无           | ✅ 定期检查 + 自动恢复 |
| 错误诊断      | ⚠️ 基础         | ✅ 详细建议和定位      |
| 一键迁移      | ❌ 无           | ✅ 多种迁移方式        |
| 企业级稳定性  | ⚠️ 个人使用     | ✅ 生产环境就绪        |

---

## 📖 文档

- [StableClaw 官方文档](https://docs.stableclaw.ai)
- [配置热重载与插件热插拔](./docs/plugin-hot-reload-plan.md)
- [更新日志](./CHANGELOG.md)
- [项目愿景](./VISION.md)
- [贡献指南](./CONTRIBUTING.md)

---

## 🛠️ 开发

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
├── scripts/                       # 构建、部署、安装脚本
├── apps/                          # 桌面应用（macOS/iOS/Android）
├── docs/                          # 文档
└── packages/                      # 内部共享包
```

---

## 🤝 贡献

我们欢迎所有形式的贡献！

- **报告问题：** [GitHub Issues](https://github.com/ctz168/stableclaw/issues)
- **功能建议：** [GitHub Discussions](https://github.com/ctz168/stableclaw/discussions)
- **代码贡献：** 请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)

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
