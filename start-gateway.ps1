# StableClaw Gateway 启动脚本
# 使用方法: .\start-gateway.ps1

# 设置配置目录为你的实际配置目录
$env:OPENCLAW_STATE_DIR = "$HOME\.stableclaw"

Write-Host "启动 StableClaw Gateway..." -ForegroundColor Green
Write-Host "配置目录: $env:OPENCLAW_STATE_DIR" -ForegroundColor Cyan

# 进入项目目录 (使用脚本所在目录)
Set-Location $PSScriptRoot

try {
    # 检查 pnpm 是否可用
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Host "错误: 未找到 pnpm。请确保已安装 Node.js 和 pnpm，并将其添加到 PATH 中。" -ForegroundColor Red
    } else {
        # 运行 gateway
        pnpm stableclaw gateway run --bind loopback --port 18789
    }
} catch {
    Write-Host "发生意外错误: $_" -ForegroundColor Red
}

Write-Host "`n按任意键退出..."
$null = [Console]::ReadKey()

