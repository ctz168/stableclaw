# 🦞 StableClaw — 企业级稳定版 AI 助手

<p align="center">
  <strong>EXFOLIATE! EXFOLIATE!</strong>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/openclaw/openclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="https://discord.gg/clawd"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

## 📋 项目简介

**StableClaw** 是基于 [StableClaw](https://github.com/openclaw/openclaw) **v2026.4.3** 版本的**企业级稳定增强版**，专注于生产环境的稳定性、可靠性和可维护性。

**StableClaw** 在 StableClaw 的基础上，增加了多项企业级增强功能，特别适合需要高可用性、零停机维护和自动化运维的生产环境。

---

## 🌟 StableClaw 核心特色

### 1. 🔄 配置热重载安全机制

**问题：** StableClaw 原版在配置文件修改后，如果配置无效会导致 gateway 崩溃或拒绝启动。

**StableClaw 解决方案：**

- ✅ **配置状态持久化** - 跟踪配置有效性状态，维护最后有效配置快照
- ✅ **自动回滚机制** - 配置无效时自动回滚到上一个有效配置
- ✅ **详细错误诊断** - 提供智能修复建议和错误位置定位
- ✅ **零停机配置更新** - 配置错误不影响 gateway 运行

**使用示例：**

```bash
# 修改配置文件（即使出错也不影响运行）
$ vim ~/.openclaw/config.json

# Gateway 自动检测配置错误
⚠️  Last configuration change was invalid. Gateway will start with the last valid configuration.
   Error: Invalid type. Expected "string" but received "undefined" at "gateway.port"
   Suggestion: Add a string value for "gateway.port" in your configuration file.
   Invalid config saved to: .invalid-config-2026-04-03T16-30-00.json
```

---

### 2. 🔒 严格单例模式

**问题：** StableClaw 原版可能启动多个 gateway 实例，导致端口冲突、资源浪费和状态混乱。

**StableClaw 解决方案：**

- ✅ **全局单例锁** - `gateway.global.lock` 强制严格单例
- ✅ **立即失败模式** - 已有实例时立即拒绝，不等待
- ✅ **清晰错误提示** - 告知用户如何停止现有实例
- ✅ **进程状态检查** - 自动检测和处理僵尸进程
- ✅ **mDNS 缓存清理** - 停止时自动清理 Bonjour 缓存，避免重启时的名称冲突

**使用示例：**

```bash
# 第一次启动
$ openclaw gateway run
✓ Gateway started on port 18789

# 第二次启动（立即失败）
$ openclaw gateway run
✗ Error: gateway already running (pid 12345)
  Use 'openclaw gateway stop' to stop it before starting a new instance.

# 停止 gateway（自动清理 mDNS 缓存）
$ openclaw gateway stop
✓ Gateway stopped
✓ mDNS cache cleared

# 再次启动（不会出现名称冲突）
$ openclaw gateway run
✓ Gateway started successfully
```

---

### 3. 🔌 插件热插拔机制

**问题：** StableClaw 原版安装/卸载插件需要重启 gateway，插件错误可能导致 gateway 崩溃。

**StableClaw 解决方案：**

- ✅ **插件安装热重载** - 安装插件后自动加载，无需重启 gateway
- ✅ **插件卸载热卸载** - 卸载插件前自动清理，无需重启 gateway
- ✅ **插件错误隔离** - 插件错误自动禁用，不影响 gateway 运行
- ✅ **健康监控机制** - 定期检查插件健康状态，自动恢复临时性问题

**技术实现：**

- **热重载管理器** (`plugin-hot-reload.ts`) - 管理插件加载、卸载、重载
- **健康检查器** (`plugin-health-checker.ts`) - 定期健康检查和自动恢复
- **错误边界** (`plugin-error-boundary.ts`) - 捕获所有插件错误并隔离

**使用示例：**

```bash
# 安装插件（立即生效）
$ stableclaw plugin install my-plugin
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

**问题：** StableClaw 原版在遇到错误时可能直接崩溃或停止服务。

**StableClaw 解决方案：**

- ✅ **全局错误捕获** - 捕获未处理的异常和 Promise 拒绝
- ✅ **自动错误隔离** - 将错误限制在最小范围内
- ✅ **详细错误日志** - 记录完整的错误上下文和堆栈
- ✅ **自动恢复机制** - 尝试自动恢复临时性问题

---

### 5. 📊 健康监控和自动化运维

**特色功能：**

- ✅ **插件健康检查** - 定期检查插件状态（默认 1 分钟）
- ✅ **自动恢复机制** - 尝试恢复降级的插件
- ✅ **健康状态报告** - 提供插件健康状态查询接口
- ✅ **连续错误检测** - 自动禁用持续失败的插件

**监控日志示例：**

```
[plugin-health] Starting plugin health checker (interval: 60000ms)
[plugin-health] Checking health of plugin my-plugin (status: degraded)
[plugin-health] Attempting to recover plugin my-plugin
[plugin-health] Plugin my-plugin recovery attempt completed
```

---

### 6. 🔄 一键迁移功能

**问题：** StableClaw 用户升级到 StableClaw 需要手动迁移配置、插件和数据，过程繁琐且容易出错。

**解决方案：** 自动检测运行中的 StableClaw，提供傻瓜式迁移流程。

#### 迁移步骤（推荐）

**步骤 1：启动 StableClaw**

```bash
# 先启动 StableClaw（让迁移工具自动检测）
openclaw gateway run
```

**步骤 2：执行迁移**

```bash
# 自动检测运行中的 StableClaw 并迁移
stableclaw migrate from-openclaw --create-backup
```

**步骤 3：验证迁移**

```bash
# 检查迁移状态
stableclaw migrate status

# 验证配置
stableclaw config get

# 验证插件
stableclaw plugins list
```

#### 方式1：内置命令（推荐）

```bash
# 预览迁移（不修改文件）
stableclaw migrate from-openclaw --dry-run

# 执行迁移并创建备份
stableclaw migrate from-openclaw --create-backup

# 手动指定 StableClaw 目录（如果未运行）
stableclaw migrate from-openclaw --openclaw-dir ~/.openclaw
```

#### 方式2：独立脚本（无需安装 StableClaw）

```bash
# 下载迁移脚本
# 先启动 StableClaw
openclaw gateway run

# 运行迁移脚本
node migrate-from-openclaw.js --dry-run
node migrate-from-openclaw.js --create-backup

# 手动指定目录
node migrate-from-openclaw.js --openclaw-dir ~/.openclaw
```

#### 自动检测机制

迁移工具会自动：

1. ✅ **检测运行中的 StableClaw 进程**
2. ✅ **提取配置目录路径**（从运行进程）
3. ✅ **迁移所有数据**（配置、插件、凭证、数据）
4. ✅ **生成详细报告**

如果 StableClaw 未运行，迁移工具会：

- 搜索常见配置目录位置
- 提示用户启动 StableClaw 或手动指定路径

#### 迁移内容

**核心数据：**

- ✅ **配置文件**：`openclaw.json` → `stableclaw.json`
- ✅ **插件目录**：`extensions/` (所有已安装的插件)
- ✅ **凭证密钥**：`credentials/` (API 密钥、令牌)

**重要数据：**

- ✅ **身份认证**：`identity/` (设备认证、身份信息) ⭐ **重要**
- ✅ **配置备份**：`backups/` (历史配置备份)
- ✅ **微信数据**：`openclaw-weixin/` (微信账户信息) ⭐ **重要**
- ✅ **执行审批**：`exec-approvals.json` (执行权限设置)

**运行数据：**

- ✅ **记忆数据**：`memory/` (对话记忆、上下文) ⭐ **重要**
- ✅ **任务数据**：`tasks/` (定时任务、后台任务)
- ✅ **代理配置**：`agents/` (Agent 配置和状态)
- ✅ **设备信息**：`devices/` (已配对设备)

**渠道数据：**

- ✅ **Telegram**：`telegram/`
- ✅ **Discord**：`discord/`
- ✅ **Slack**：`slack/`

**工作区数据：**

- ✅ **画布**：`canvas/`
- ✅ **工作区**：`workspace/` (包含 Skills)

**其他数据：**

- ✅ **日志文件**：`logs/`
- ✅ **投递队列**：`delivery-queue/`
- ✅ **Shell 补全**：`completions/`

**注：** Skills 存储在 `workspace/skills/` 目录下，会随 workspace 一起迁移。

#### 迁移选项

| 选项                 | 说明                     |
| -------------------- | ------------------------ |
| `--dry-run`          | 预览迁移，不修改文件     |
| `--skip-plugins`     | 跳过插件迁移             |
| `--skip-credentials` | 跳过凭证迁移             |
| `--skip-logs`        | 跳过日志迁移             |
| `--force`            | 强制迁移（覆盖现有数据） |
| `--create-backup`    | 创建备份                 |
| `--openclaw-dir`     | 手动指定 StableClaw 目录   |

**优势**：

- 🎯 **傻瓜式操作**：只需启动 StableClaw，其余自动完成
- 🚀 **零停机迁移**：迁移过程不影响 StableClaw 使用
- 🔒 **数据安全**：自动备份机制，支持回滚
- ⚡ **灵活选择**：可选择性地迁移特定内容
- 🎨 **详细报告**：提供完整的迁移日志和错误诊断

---

## 🆚 与 StableClaw 对比

| 特性          | StableClaw 原版   | StableClaw             |
| ------------- | --------------- | ---------------------- |
| 配置热重载    | ✅ 支持         | ✅ 支持 + 安全回滚     |
| 配置错误处理  | ⚠️ 可能崩溃     | ✅ 自动回滚，零停机    |
| 多实例防护    | ⚠️ 可能启动多个 | ✅ 严格单例，立即失败  |
| 插件安装/卸载 | ⚠️ 需要重启     | ✅ 热插拔，零停机      |
| 插件错误处理  | ⚠️ 可能崩溃     | ✅ 自动隔离和禁用      |
| 健康监控      | ❌ 无           | ✅ 定期检查 + 自动恢复 |
| 错误诊断      | ⚠️ 基础         | ✅ 详细建议和定位      |
| **一键迁移**  | ❌ 无           | ✅ 多种迁移方式        |
| 企业级稳定性  | ⚠️ 个人使用     | ✅ 生产环境就绪        |

---

## 🚀 快速开始

### 安装

**运行时要求：** Node 24 (推荐) 或 Node 22.16+

```bash
# 克隆仓库
git clone https://github.com/your-username/stableclaw.git
cd stableclaw

# 安装依赖
pnpm install

# 构建项目
pnpm build

# 启动 gateway
pnpm stableclaw gateway run
```

### 配置向导

```bash
# 运行配置向导
pnpm stableclaw onboard --install-daemon
```

---

## 📖 文档

- [StableClaw 官方文档](https://docs.stableclaw.ai)
- [StableClaw 特色功能文档](./docs/plugin-hot-reload-plan.md)
- [配置热重载安全机制](./docs/plugin-hot-reload-plan.md)
- [插件热插拔机制](./docs/plugin-hot-reload-plan.md)
- [更新日志](./CHANGELOG.md)
- [愿景](./VISION.md)

---

## 🛠️ 开发

### 构建和测试

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
│   ├── config/
│   │   ├── config-status.ts          # 配置状态管理
│   │   └── validation.ts             # 增强的配置验证
│   ├── gateway/
│   │   ├── config-error-handler.ts   # 配置错误处理器
│   │   └── config-reload.ts          # 配置热重载逻辑
│   ├── plugins/
│   │   ├── plugin-hot-reload.ts      # 插件热重载管理器
│   │   ├── plugin-health-checker.ts  # 插件健康检查器
│   │   ├── plugin-error-handler.ts   # 插件错误处理器
│   │   └── plugin-error-boundary.ts  # 插件错误边界
│   ├── infra/
│   │   └── gateway-lock.ts           # 严格单例锁机制
│   └── cli/
│       └── gateway-cli/
│           ├── run.ts                # Gateway 启动逻辑
│           └── run-loop.ts           # Gateway 运行循环
├── docs/
│   └── plugin-hot-reload-plan.md     # 实现计划文档
└── README.md                          # 本文档
```

---

## 🤝 贡献

我们欢迎所有形式的贡献！

- **报告问题：** [GitHub Issues](https://github.com/your-username/stableclaw/issues)
- **功能建议：** [GitHub Discussions](https://github.com/your-username/stableclaw/discussions)
- **代码贡献：** 请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

---

## 🙏 致谢

**StableClaw** 是基于 [StableClaw](https://github.com/openclaw/openclaw) 项目的二次开发版本，感谢 StableClaw 团队的出色工作！

### StableClaw 原版特性

- 支持 20+ 消息渠道
- 多模型支持（OpenAI, Anthropic, Google, etc.）
- 插件生态系统
- 语音助手支持（macOS/iOS/Android）
- 实时画布渲染
- 端到端加密

--

<p align="center">
  <strong>Made with ❤️ by the StableClaw Team</strong>
</p>

<p align="center">
  <sub>Based on StableClaw v2026.4.3</sub>
</p>
