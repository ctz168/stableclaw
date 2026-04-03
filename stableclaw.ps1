# StableClaw 通用启动脚本
# 使用方法: .\stableclaw.ps1 <命令>
# 例如: .\stableclaw.ps1 gateway run

# 设置配置目录
$env:OPENCLAW_STATE_DIR = "C:\Users\Administrator\.stableclaw"

# 进入项目目录
Set-Location "C:\Users\Administrator\Desktop\stableclaw"

# 运行命令（如果没提供参数则显示帮助）
if ($args.Count -eq 0) {
    pnpm stableclaw --help
} else {
    pnpm stableclaw @args
}
