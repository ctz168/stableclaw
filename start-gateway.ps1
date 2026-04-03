# StableClaw Gateway 启动脚本
# 使用方法: .\start-gateway.ps1

# 设置配置目录为你的实际配置目录
$env:OPENCLAW_STATE_DIR = "C:\Users\Administrator\.stableclaw"

Write-Host "启动 StableClaw Gateway..." -ForegroundColor Green
Write-Host "配置目录: $env:OPENCLAW_STATE_DIR" -ForegroundColor Cyan

# 进入项目目录
Set-Location "C:\Users\Administrator\Desktop\stableclaw"

# 运行 gateway
pnpm stableclaw gateway run --bind loopback --port 18789
