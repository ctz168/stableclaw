#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# StableClaw - 一键发布到 npm
# ──────────────────────────────────────────────────────────
# 用法:
#   ./scripts/publish-npm.sh                  # 交互式输入 token
#   ./scripts/publish-npm.sh <npm-token>      # 直接传入 token
#   NPM_TOKEN=xxx ./scripts/publish-npm.sh    # 通过环境变量传入 token
#
# 前提条件:
#   - Node.js >= 22.12
#   - pnpm (已安装)
#   - npm 账号已创建
#   - 包名 stableclaw 在 npm 上未被占用
# ──────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NPMRC_PATH="$PROJECT_DIR/.npmrc"
NPMRC_BACKUP="$PROJECT_DIR/.npmrc.backup"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── 清理函数 ──
cleanup() {
  # 恢复原始 .npmrc（去掉 token）
  if [[ -f "$NPMRC_BACKUP" ]]; then
    mv "$NPMRC_BACKUP" "$NPMRC_PATH"
    info "已恢复原始 .npmrc"
  fi
}
trap cleanup EXIT

# ── 获取 npm token ──
get_npm_token() {
  # 优先级: 命令行参数 > 环境变量 > 交互输入
  if [[ $# -gt 0 ]]; then
    echo "$1"
  elif [[ -n "${NPM_TOKEN:-}" ]]; then
    echo "$NPM_TOKEN"
  else
    echo -n "请输入 npm token: " >&2
    read -r -s TOKEN
    echo "" >&2
    if [[ -z "$TOKEN" ]]; then
      error "npm token 不能为空"
      exit 1
    fi
    echo "$TOKEN"
  fi
}

# ── 步骤 1: 前置检查 ──
step_check() {
  info "═══════════════════════════════════════"
  info "  StableClaw npm 发布工具"
  info "═══════════════════════════════════════"
  echo ""

  # 检查 Node.js
  if ! command -v node &>/dev/null; then
    error "未找到 Node.js，请先安装 Node.js >= 22.12"
    exit 1
  fi
  local node_version
  node_version=$(node --version)
  ok "Node.js: $node_version"

  # 检查 npm
  if ! command -v npm &>/dev/null; then
    error "未找到 npm"
    exit 1
  fi
  local npm_version
  npm_version=$(npm --version)
  ok "npm: v$npm_version"

  # 检查 pnpm
  local pnpm_cmd="pnpm"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    pnpm_cmd="pnpm.cmd"
  fi
  if ! command -v "$pnpm_cmd" &>/dev/null; then
    warn "未找到 pnpm，尝试自动安装..."
    npm install -g pnpm
    if ! command -v "$pnpm_cmd" &>/dev/null; then
      error "pnpm 安装失败，请手动安装: npm install -g pnpm"
      exit 1
    fi
  fi
  local pnpm_version
  pnpm_version=$("$pnpm_cmd" --version)
  ok "pnpm: v$pnpm_version"

  # 确认在项目根目录
  if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
    error "未找到 package.json，请在 stableclaw 项目根目录运行"
    exit 1
  fi
  ok "项目目录: $PROJECT_DIR"

  # 读取当前版本
  local current_version
  current_version=$(node -p "require('$PROJECT_DIR/package.json').version" 2>/dev/null || echo "unknown")
  ok "当前版本: $current_version"

  # 检查该版本是否已发布
  if npm view "stableclaw@$current_version" version &>/dev/null; then
    warn "版本 $current_version 已存在于 npm，将尝试覆盖发布"
  fi

  echo ""
}

# ── 步骤 2: 配置 npm token ──
step_setup_auth() {
  local token="$1"
  info "配置 npm 认证..."

  # 验证 token 格式（npm token 通常以 npm_ 开头）
  if [[ ! "$token" =~ ^npm_ ]]; then
    warn "token 格式看起来不像 npm token（通常以 npm_ 开头），但仍然尝试使用"
  fi

  # 备份原始 .npmrc
  cp "$NPMRC_PATH" "$NPMRC_BACKUP"

  # 检查 .npmrc 中是否已有 token 行，如果有则替换，否则追加
  if grep -q '//registry.npmjs.org/:_authToken' "$NPMRC_PATH" 2>/dev/null; then
    # 替换现有 token
    sed -i.bak "s|//registry.npmjs.org/:_authToken=.*|//registry.npmjs.org/:_authToken=${token}|" "$NPMRC_PATH"
    rm -f "$NPMRC_PATH.bak"
    ok "已更新 .npmrc 中的 npm token"
  else
    # 追加 token
    echo "" >> "$NPMRC_PATH"
    echo "# npm publish auth" >> "$NPMRC_PATH"
    echo "//registry.npmjs.org/:_authToken=${token}" >> "$NPMRC_PATH"
    ok "已添加 npm token 到 .npmrc"
  fi

  # 验证 token 有效性
  info "验证 npm 认证..."
  local npm_user
  npm_user=$(npm whoami 2>&1) || true
  if [[ "$npm_user" == *"E401"* || "$npm_user" == *"E403"* || "$npm_user" == *"Unauthorized"* ]]; then
    error "npm token 无效或已过期，请检查 token"
    exit 1
  fi
  ok "npm 认证成功，用户: $npm_user"
  echo ""
}

# ── 步骤 3: 构建项目 ──
step_build() {
  local pnpm_cmd="pnpm"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    pnpm_cmd="pnpm.cmd"
  fi

  # 确保 pnpm 可用（处理 corepack / 非 PATH 环境）
  if ! command -v "$pnpm_cmd" &>/dev/null; then
    # 尝试 corepack shims 路径
    local corepack_shim="/usr/lib/node_modules/corepack/shims/$pnpm_cmd"
    if [[ -x "$corepack_shim" ]]; then
      pnpm_cmd="$corepack_shim"
      ok "使用 corepack shim: $pnpm_cmd"
    else
      error "pnpm 不可用，请先安装: npm install -g pnpm 或 corepack enable"
      exit 1
    fi
  fi

  info "构建项目..."

  # 安装依赖
  info "  [1/3] pnpm install..."
  "$pnpm_cmd" install
  ok "  [1/3] 依赖安装完成"

  # 清理旧构建产物，避免残留文件混淆
  info "  [2/3] 清理旧 dist..."
  rm -rf "$PROJECT_DIR/dist"
  ok "  [2/3] 旧 dist 已清理"

  # 构建（核心：生成 dist/entry.js 等必要文件）
  info "  [3/4] pnpm build..."
  "$pnpm_cmd" build
  ok "  [3/4] 构建完成"

  # 构建 UI（Dashboard 控制面板前端资源）
  # 注意：pnpm build 不包含 ui:build！这是独立的命令！
  info "  [4/4] pnpm ui:build..."
  if ! "$pnpm_cmd" ui:build; then
    error "  [4/4] UI 构建失败！Dashboard 将无法使用。终止发布。"
    error "  请检查 ui/ 目录和 UI 依赖是否正确安装。"
    exit 1
  fi
  ok "  [4/4] UI 构建完成"

  echo ""
}

# ── 步骤 3.5: 构建后验证（关键安全检查） ──
step_verify_build() {
  info "验证构建产物完整性..."
  local errors=0

  # 检查 dist/entry.js — 这是最关键的入口文件
  # 如果缺失，stableclaw.mjs 会抛出 "missing dist/entry.(m)js (build output)"
  if [[ ! -f "$PROJECT_DIR/dist/entry.js" && ! -f "$PROJECT_DIR/dist/entry.mjs" ]]; then
    error "  dist/entry.js 或 dist/entry.mjs 不存在！构建失败或被跳过。"
    error "  必须先执行完整构建: pnpm build"
    errors=$((errors + 1))
  else
    ok "  dist/entry.js 存在"
  fi

  # 检查 dist/index.js
  if [[ ! -f "$PROJECT_DIR/dist/index.js" && ! -f "$PROJECT_DIR/dist/index.mjs" ]]; then
    error "  dist/index.js 或 dist/index.mjs 不存在！"
    errors=$((errors + 1))
  else
    ok "  dist/index.js 存在"
  fi

  # 检查 Dashboard UI — 如果缺失，用户打开 Dashboard 会报错
  # "Control UI assets not found"
  if [[ ! -f "$PROJECT_DIR/dist/control-ui/index.html" ]]; then
    error "  dist/control-ui/index.html 不存在！Dashboard 将无法加载。"
    error "  必须执行: pnpm ui:build"
    errors=$((errors + 1))
  else
    ok "  dist/control-ui/index.html 存在（Dashboard UI 可用）"
  fi

  # 检查扩展的 runtime-api.js
  local extensions=("speech-core" "image-generation-core" "media-understanding-core")
  for ext in "${extensions[@]}"; do
    if [[ -f "$PROJECT_DIR/dist/extensions/$ext/runtime-api.js" ]]; then
      ok "  dist/extensions/$ext/runtime-api.js 存在"
    fi
  done

  # 运行项目自带的 release-check（如果可用）
  if [[ -f "$PROJECT_DIR/scripts/release-check.ts" ]]; then
    info "  运行 release-check..."
    if node --import tsx "$PROJECT_DIR/scripts/release-check.ts" 2>&1; then
      ok "  release-check 通过"
    else
      warn "  release-check 失败（检查上方输出），但继续发布"
    fi
  fi

  if [[ $errors -gt 0 ]]; then
    error "构建产物验证失败 ($errors 个错误)，终止发布！"
    error "请先运行完整构建: pnpm build"
    exit 1
  fi

  echo ""
}

# ── 步骤 4: 发布 ──
step_publish() {
  local current_version
  current_version=$(node -p "require('$PROJECT_DIR/package.json').version")

  info "发布 stableclaw@$current_version 到 npm..."
  echo ""

  # 先 dry-run 验证包可以正常打包
  info "预检查 npm pack..."
  if ! npm pack --dry-run --ignore-scripts > /dev/null 2>&1; then
    error "npm pack --dry-run 失败，包可能有问题"
    exit 1
  fi
  ok "npm pack 预检查通过"
  echo ""

  # 使用 OPENCLAW_PREPACK_PREPARED=1 跳过 prepack 中的重复构建
  # 因为步骤 3 已经完成了完整构建
  if OPENCLAW_PREPACK_PREPARED=1 npm publish --access public "$PROJECT_DIR"; then
    echo ""
    ok "═══════════════════════════════════════"
    ok "  发布成功!"
    ok "  包名: stableclaw"
    ok "  版本: $current_version"
    ok "  安装: npm install -g stableclaw"
    ok "═══════════════════════════════════════"
  else
    error "发布失败！请检查错误信息"
    exit 1
  fi
}

# ── 步骤 5: 验证发布 ──
step_verify() {
  local current_version
  current_version=$(node -p "require('$PROJECT_DIR/package.json').version")

  info "验证发布结果..."
  sleep 2  # 等待 npm registry 同步

  local published_version
  published_version=$(npm view stableclaw version 2>/dev/null || echo "not found")

  if [[ "$published_version" == "$current_version" ]]; then
    ok "验证通过: npm 上最新版本为 $published_version"
  else
    warn "npm 上最新版本为 $published_version（可能是缓存延迟）"
  fi

  echo ""
  info "后续步骤:"
  info "  1. 全局安装测试: npm install -g stableclaw"
  info "  2. 运行验证:     stableclaw --version"
  info "  3. 推送到 Git:   git add . && git commit && git push"
}

# ── 步骤 6: 跳过构建直接发布（可选） ──
step_publish_only() {
  local current_version
  current_version=$(node -p "require('$PROJECT_DIR/package.json').version")

  # 检查 dist/ 是否存在
  if [[ ! -f "$PROJECT_DIR/dist/entry.js" ]]; then
    error "dist/entry.js 不存在，请先构建项目（不使用 --skip-build）"
    exit 1
  fi

  info "跳过构建，直接发布 stableclaw@$current_version..."
  echo ""

  if OPENCLAW_PREPACK_PREPARED=1 npm publish --access public "$PROJECT_DIR"; then
    echo ""
    ok "发布成功! stableclaw@$current_version"
  else
    error "发布失败！"
    exit 1
  fi
}

# ── 主流程 ──
main() {
  local skip_build=false
  local skip_verify_build=false
  local token=""

  # 解析参数
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-build)
        skip_build=true
        shift
        ;;
      --skip-verify)
        skip_verify_build=true
        shift
        ;;
      --help|-h)
        echo "StableClaw npm 一键发布工具"
        echo ""
        echo "用法:"
        echo "  ./scripts/publish-npm.sh [选项] [npm-token]"
        echo ""
        echo "选项:"
        echo "  --skip-build    跳过构建步骤，直接发布（需要已有 dist/ 产物）"
        echo "  --skip-verify   跳过构建后验证（不推荐）"
        echo "  --help, -h      显示帮助信息"
        echo ""
        echo "npm token 获取方式:"
        echo "  1. 登录 https://www.npmjs.com"
        echo "  2. 进入 Access Tokens 页面"
        echo "  3. 点击 Generate New Token -> Classic Token"
        echo "  4. 选择 Automation 类型（适合 CI/CD）"
        echo "  5. 复制生成的 token（格式: npm_xxxxx）"
        exit 0
        ;;
      *)
        token="$1"
        shift
        ;;
    esac
  done

  # 如果没传 token，尝试从参数或环境变量获取
  if [[ -z "$token" ]]; then
    token=$(get_npm_token)
  fi

  # 执行步骤
  step_check
  step_setup_auth "$token"

  if [[ "$skip_build" == true ]]; then
    step_publish_only
  else
    step_build
    if [[ "$skip_verify_build" != true ]]; then
      step_verify_build   # 构建后验证（关键安全检查）
    fi
    step_publish
  fi

  step_verify
}

main "$@"
