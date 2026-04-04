@echo off
REM ──────────────────────────────────────────────────────────
REM StableClaw - 一键发布到 npm (Windows PowerShell)
REM ──────────────────────────────────────────────────────────
REM 用法:
REM   .\scripts\publish-npm.ps1                  # 交互式输入 token
REM   .\scripts\publish-npm.ps1 -Token npm_xxx   # 直接传入 token
REM   $env:NPM_TOKEN="npm_xxx"; .\scripts\publish-npm.ps1  # 环境变量
REM
REM 前提条件:
REM   - Node.js >= 22.12
REM   - pnpm (npm install -g pnpm)
REM   - npm 账号
REM ──────────────────────────────────────────────────────────

param(
    [string]$Token = "",
    [switch]$SkipBuild,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host @"
StableClaw npm 一键发布工具 (Windows)

用法:
  .\scripts\publish-npm.ps1 [选项]

选项:
  -Token <npm-token>   直接传入 npm token
  -SkipBuild           跳过构建步骤，直接发布
  -Help                显示帮助信息

环境变量:
  NPM_TOKEN            设置此环境变量可免输入 token

npm token 获取:
  1. 登录 https://www.npmjs.com
  2. Access Tokens -> Generate New Token -> Classic Token
  3. 选择 Automation 类型
  4. 复制 token (格式: npm_xxxxx)
"@
    exit 0
}

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$NpmrcPath = Join-Path $ProjectDir ".npmrc"
$NpmrcBackup = Join-Path $ProjectDir ".npmrc.backup"

function Write-Info($msg)  { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ── 清理函数 ──
function Cleanup {
    if (Test-Path $NpmrcBackup) {
        Move-Item -Force $NpmrcBackup $NpmrcPath
        Write-Info "已恢复原始 .npmrc"
    }
}

# ── 注册清理 ──
try {
    # ── 获取 token ──
    if (-not $Token) {
        $Token = $env:NPM_TOKEN
    }
    if (-not $Token) {
        $Token = Read-Host "请输入 npm token" -AsSecureString | ConvertFrom-SecureString -AsPlainText
    }
    if (-not $Token) {
        Write-Err "npm token 不能为空"
        exit 1
    }

    # ── 步骤 1: 前置检查 ──
    Write-Info "========================================="
    Write-Info "  StableClaw npm 发布工具"
    Write-Info "========================================="
    Write-Host ""

    $nodeVersion = (node --version)
    Write-Ok "Node.js: $nodeVersion"

    $npmVersion = (npm --version)
    Write-Ok "npm: v$npmVersion"

    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Warn "未找到 pnpm，尝试自动安装..."
        npm install -g pnpm
    }
    $pnpmVersion = (pnpm --version)
    Write-Ok "pnpm: v$pnpmVersion"

    $packageJson = Get-Content (Join-Path $ProjectDir "package.json") -Raw | ConvertFrom-Json
    $currentVersion = $packageJson.version
    Write-Ok "当前版本: $currentVersion"
    Write-Host ""

    # ── 步骤 2: 配置 token ──
    Write-Info "配置 npm 认证..."
    Copy-Item $NpmrcPath $NpmrcBackup

    $npmrcContent = Get-Content $NpmrcPath -Raw
    if ($npmrcContent -match '//registry\.npmjs\.org/:_authToken=') {
        $npmrcContent = $npmrcContent -replace '//registry\.npmjs\.org/:_authToken=.*', "//registry.npmjs.org/:_authToken=$Token"
        Set-Content -Path $NpmrcPath -Value $npmrcContent
        Write-Ok "已更新 .npmrc 中的 npm token"
    } else {
        Add-Content -Path $NpmrcPath -Value "`n# npm publish auth`n//registry.npmjs.org/:_authToken=$Token"
        Write-Ok "已添加 npm token 到 .npmrc"
    }

    Write-Info "验证 npm 认证..."
    $npmUser = npm whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm token 无效或已过期"
        exit 1
    }
    Write-Ok "npm 认证成功，用户: $npmUser"
    Write-Host ""

    # ── 步骤 3: 构建（可选） ──
    if (-not $SkipBuild) {
        Write-Info "构建项目..."
        Write-Info "  [1/3] pnpm install..."
        pnpm install
        if ($LASTEXITCODE -ne 0) { Write-Err "依赖安装失败"; exit 1 }
        Write-Ok "  [1/3] 依赖安装完成"

        Write-Info "  [2/3] pnpm build..."
        pnpm build
        if ($LASTEXITCODE -ne 0) { Write-Err "构建失败"; exit 1 }
        Write-Ok "  [2/3] 构建完成"

        Write-Info "  [3/3] pnpm ui:build..."
        pnpm ui:build
        if ($LASTEXITCODE -ne 0) { Write-Err "UI 构建失败"; exit 1 }
        Write-Ok "  [3/3] UI 构建完成"
        Write-Host ""
    } else {
        $entryJs = Join-Path $ProjectDir "dist/entry.js"
        if (-not (Test-Path $entryJs)) {
            Write-Err "dist/entry.js 不存在，请先构建项目"
            exit 1
        }
    }

    # ── 步骤 4: 发布 ──
    Write-Info "发布 stableclaw@$currentVersion 到 npm..."
    Write-Host ""

    $env:OPENCLAW_PREPACK_PREPARED = "1"
    npm publish --access public $ProjectDir
    if ($LASTEXITCODE -ne 0) {
        Write-Err "发布失败！请检查错误信息"
        exit 1
    }

    Write-Host ""
    Write-Ok "========================================="
    Write-Ok "  发布成功!"
    Write-Ok "  包名: stableclaw"
    Write-Ok "  版本: $currentVersion"
    Write-Ok "  安装: npm install -g stableclaw"
    Write-Ok "========================================="

    # ── 步骤 5: 验证 ──
    Write-Host ""
    Write-Info "验证发布结果..."
    Start-Sleep -Seconds 2

    $publishedVersion = npm view stableclaw version 2>$null
    if ($publishedVersion -eq $currentVersion) {
        Write-Ok "验证通过: npm 上最新版本为 $publishedVersion"
    } else {
        Write-Warn "npm 上最新版本为 $publishedVersion（可能是缓存延迟）"
    }

    Write-Host ""
    Write-Info "后续步骤:"
    Write-Info "  1. 全局安装测试: npm install -g stableclaw"
    Write-Info "  2. 运行验证:     stableclaw --version"

} finally {
    Cleanup
}
