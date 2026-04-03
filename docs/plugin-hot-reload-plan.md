# 插件热插拔实现计划

## 📋 现状分析

### 已有功能
- ✅ 插件错误处理器 (`plugin-error-handler.ts`)
  - 错误记录和健康状态跟踪
  - 自动禁用机制
  - 版本备份和回滚

- ✅ 配置热重载 (`server-reload-handlers.ts`)
  - Hooks 热重载
  - Cron 热重载
  - Channels 热重载
  - Health Monitor 热重载

- ✅ 插件加载器 (`loader.ts`)
  - 插件加载和注册
  - 错误隔离（已实现）

### 缺失功能
- ❌ 插件安装后自动热重载
- ❌ 插件卸载后自动清理
- ❌ 插件健康检查定时任务
- ❌ 运行时错误隔离增强

---

## 🎯 实现目标

### 1. 插件安装/卸载热重载
- 安装插件后自动加载，不重启 gateway
- 卸载插件后自动清理，不重启 gateway
- 更新插件后自动重新加载

### 2. 插件健康检查
- 定时健康检查（可配置间隔）
- 自动恢复临时性问题
- 健康状态报告

### 3. 运行时错误隔离增强
- 包装所有插件 API 调用
- 捕获未处理的 Promise 拒绝
- 捕获未捕获的异常

---

## 📂 需要修改的文件

### 新增文件
1. `src/plugins/plugin-hot-reload.ts` - 插件热重载核心逻辑
2. `src/plugins/plugin-health-checker.ts` - 插件健康检查器
3. `src/plugins/plugin-error-boundary.ts` - 插件错误边界

### 修改文件
1. `src/plugins/install.ts` - 添加热重载钩子
2. `src/plugins/uninstall.ts` - 添加热重载钩子
3. `src/gateway/server-reload-handlers.ts` - 集成插件热重载
4. `src/cli/gateway-cli/run.ts` - 启动健康检查器
5. `src/plugins/loader.ts` - 集成错误边界

---

## 🔧 实现步骤

### 阶段 1：插件热重载核心（优先级：高）

#### 步骤 1.1：创建 `plugin-hot-reload.ts`
```typescript
// 核心功能
export async function reloadPlugin(pluginId: string): Promise<void>
export async function unloadPlugin(pluginId: string): Promise<void>
export async function loadNewPlugin(pluginId: string): Promise<void>
```

#### 步骤 1.2：修改 `install.ts`
- 安装完成后调用 `loadNewPlugin()`
- 触发插件加载和注册

#### 步骤 1.3：修改 `uninstall.ts`
- 卸载前调用 `unloadPlugin()`
- 清理插件状态和资源

---

### 阶段 2：插件健康检查（优先级：中）

#### 步骤 2.1：创建 `plugin-health-checker.ts`
```typescript
// 健康检查器
export class PluginHealthChecker {
  start(intervalMs: number): void
  stop(): void
  checkPlugin(pluginId: string): Promise<PluginHealthStatus>
  checkAll(): Promise<Map<string, PluginHealthStatus>>
}
```

#### 步骤 2.2：集成到 gateway 启动
- 在 `run.ts` 中启动健康检查器
- 使用配置的健康检查间隔

---

### 阶段 3：运行时错误隔离增强（优先级：中）

#### 步骤 3.1：创建 `plugin-error-boundary.ts`
```typescript
// 错误边界包装器
export function wrapPluginFunction<T>(
  pluginId: string,
  fn: () => Promise<T>
): Promise<T | undefined>

export function setupGlobalErrorHandlers(): void
```

#### 步骤 3.2：包装插件 API 调用
- 修改 `loader.ts` 中的插件加载逻辑
- 包装所有插件钩子调用

---

## 🧪 测试策略

### 单元测试
- 测试插件安装/卸载热重载
- 测试健康检查逻辑
- 测试错误隔离机制

### 集成测试
- 测试完整的插件生命周期
- 测试错误场景和恢复
- 测试性能影响

### 手动测试
1. 启动 gateway
2. 安装插件 → 验证自动加载
3. 卸载插件 → 验证自动清理
4. 触发插件错误 → 验证隔离和恢复

---

## ⚠️ 技术难点

### 1. 插件状态清理
**问题**：卸载插件时需要清理所有状态
**解决方案**：
- 维护插件状态注册表
- 卸载时清理所有相关状态
- 使用 WeakMap 避免内存泄漏

### 2. 插件依赖处理
**问题**：插件之间可能有依赖关系
**解决方案**：
- 检测依赖关系
- 按依赖顺序卸载
- 提供依赖冲突警告

### 3. 错误隔离的完整性
**问题**：无法捕获所有错误类型
**解决方案**：
- 使用 process 级别错误处理
- 定期健康检查
- 自动恢复机制

---

## 📊 预期效果

### 稳定性提升
- ✅ 插件安装/卸载不重启 gateway
- ✅ 插件错误不影响 gateway 运行
- ✅ 自动恢复临时性问题

### 可维护性提升
- ✅ 详细的错误诊断信息
- ✅ 健康状态监控
- ✅ 自动化故障处理

### 用户体验提升
- ✅ 减少重启次数
- ✅ 快速插件迭代
- ✅ 更好的错误提示

---

## 🚀 实施顺序

1. **阶段 1**：插件热重载核心（2-3 小时）
   - 创建 `plugin-hot-reload.ts`
   - 修改 `install.ts` 和 `uninstall.ts`
   - 单元测试

2. **阶段 2**：插件健康检查（1-2 小时）
   - 创建 `plugin-health-checker.ts`
   - 集成到 gateway 启动
   - 单元测试

3. **阶段 3**：运行时错误隔离增强（1-2 小时）
   - 创建 `plugin-error-boundary.ts`
   - 包装插件 API 调用
   - 单元测试

4. **集成测试**（1 小时）
   - 端到端测试
   - 性能测试
   - 文档更新

**预计总时间**：5-8 小时
