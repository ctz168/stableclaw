# StableClaw CLI 命令重命名总结

## ✅ 已完成的修改

### 1. 核心文件
- ✅ `package.json` - bin 字段从 `openclaw` 改为 `stableclaw`
- ✅ `openclaw.mjs` → `stableclaw.mjs` - 入口文件重命名
- ✅ `stableclaw.mjs` - 错误提示中的命令名和包名更新

### 2. 启动脚本
- ✅ `start-gateway.ps1` - 启动脚本中的命令更新
- ✅ `stableclaw.ps1` - 通用启动脚本

### 3. 文档更新
- ✅ `README.md` - 主要命令示例更新
- ✅ `AGENTS.md` - 开发指南中的命令示例
- ✅ `PERFORMANCE_OPTIMIZATIONS.md` - 性能优化文档中的命令和路径
- ✅ `apps/android/README.md` - Android 开发文档
- ✅ `src/hooks/bundled/README.md` - Hooks 文档
- ✅ `docs/start/setup.md` - 设置文档
- ✅ `docs/install/index.md` - 安装文档
- ✅ `docs/zh-CN/start/setup.md` - 中文设置文档
- ✅ `docs/zh-CN/start/quickstart.md` - 中文快速开始文档

## 📋 主要变更

### 命令名称
```bash
# 之前
pnpm openclaw gateway run
openclaw channels login
openclaw onboard

# 现在
pnpm stableclaw gateway run
stableclaw channels login
stableclaw onboard
```

### 配置目录
```bash
# 之前
~/.openclaw/

# 现在
~/.stableclaw/
```

### 包名和仓库
```bash
# 之前
npm install -g openclaw
github:openclaw/openclaw

# 现在
npm install -g stableclaw
github:ctz168/stableclaw
```

## 🚀 使用方法

### 方式 1：使用启动脚本（推荐）

```powershell
cd C:\Users\Administrator\Desktop\stableclaw

# 启动 gateway
.\start-gateway.ps1

# 或运行其他命令
.\stableclaw.ps1 gateway status
.\stableclaw.ps1 config list
```

### 方式 2：直接使用 pnpm

```powershell
cd C:\Users\Administrator\Desktop\stableclaw

# 设置配置目录（如果不在默认位置）
$env:OPENCLAW_STATE_DIR = "C:\Users\Administrator\.stableclaw"

# 运行命令
pnpm stableclaw gateway run --bind loopback --port 18789
```

### 方式 3：全局安装（长期方案）

```powershell
cd C:\Users\Administrator\Desktop\stableclaw
npm link

# 之后可以在任意目录运行
stableclaw gateway run --bind loopback --port 18789
```

## 📝 注意事项

1. **迁移命令保持原样**：文档中关于从 OpenClaw 迁移的部分，提到 `openclaw` 命令时指的是原版 OpenClaw，保持不变。

2. **文档批量更新**：大部分文档已更新，但由于文档数量众多，可能还有一些遗漏的地方。如发现未更新的命令，请手动更新。

3. **配置目录兼容性**：程序会自动检测 `~/.stableclaw` 和 `~/.openclaw`，优先使用 `~/.stableclaw`。

4. **环境变量**：可以通过 `OPENCLAW_STATE_DIR` 环境变量指定自定义配置目录。

## 🔧 后续工作

如果需要更新更多文档中的命令，可以运行：

```powershell
cd C:\Users\Administrator\Desktop\stableclaw
.\scripts\rename-cli-commands.ps1
```

这个脚本会批量更新所有 Markdown 文件中的命令和路径。
