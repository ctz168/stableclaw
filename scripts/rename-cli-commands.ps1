# StableClaw CLI 命令重命名脚本
# 批量替换文档中的 openclaw 命令为 stableclaw

$ErrorActionPreference = "Continue"

# 定义替换规则
$replacements = @(
    # 命令替换
    @{ Pattern = 'pnpm openclaw '; Replacement = 'pnpm stableclaw ' },
    @{ Pattern = '`openclaw gateway`'; Replacement = '`stableclaw gateway`' },
    @{ Pattern = '`openclaw channels'; Replacement = '`stableclaw channels' },
    @{ Pattern = '`openclaw onboard'; Replacement = '`stableclaw onboard' },
    @{ Pattern = '`openclaw setup`'; Replacement = '`stableclaw setup`' },
    @{ Pattern = 'openclaw gateway run'; Replacement = 'stableclaw gateway run' },
    @{ Pattern = 'openclaw onboard --'; Replacement = 'stableclaw onboard --' },
    @{ Pattern = 'openclaw channels '; Replacement = 'stableclaw channels ' },
    @{ Pattern = 'openclaw config '; Replacement = 'stableclaw config ' },
    @{ Pattern = 'openclaw plugins '; Replacement = 'stableclaw plugins ' },
    @{ Pattern = 'openclaw hooks '; Replacement = 'stableclaw hooks ' },
    @{ Pattern = 'openclaw migrate '; Replacement = 'stableclaw migrate ' },
    
    # 配置目录路径
    @{ Pattern = '~/.openclaw/'; Replacement = '~/.stableclaw/' },
    @{ Pattern = '\.openclaw/'; Replacement = '.stableclaw/' },
    
    # GitHub 仓库地址
    @{ Pattern = 'github:openclaw/openclaw'; Replacement = 'github:ctz168/stableclaw' },
    @{ Pattern = 'github\.com/openclaw/openclaw'; Replacement = 'github.com/ctz168/stableclaw' }
)

# 获取所有需要处理的 Markdown 文件（跳过无法访问的路径）
$files = @()
Get-ChildItem -Path . -Include *.md,*.mdx -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist' } |
    ForEach-Object { $files += $_ }

$processedCount = 0
$errorCount = 0

foreach ($file in $files) {
    try {
        $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        $modified = $false
        
        foreach ($rule in $replacements) {
            if ($content -match [regex]::Escape($rule.Pattern)) {
                $content = $content -replace [regex]::Escape($rule.Pattern), $rule.Replacement
                $modified = $true
            }
        }
        
        if ($modified) {
            Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
            $processedCount++
            Write-Host "✓ 已更新: $($file.Name)" -ForegroundColor Green
        }
    } catch {
        $errorCount++
        Write-Host "✗ 跳过: $($file.Name)" -ForegroundColor Yellow
    }
}

Write-Host "`n完成!" -ForegroundColor Cyan
Write-Host "已处理文件: $processedCount" -ForegroundColor Yellow
Write-Host "跳过文件: $errorCount" -ForegroundColor Yellow

