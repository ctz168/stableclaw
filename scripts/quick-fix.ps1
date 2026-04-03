# Quick fix script for startup issues
# Run this script to fix common startup problems

Write-Host "🔧 Quick Fix Script for OpenClaw Startup Issues" -ForegroundColor Cyan
Write-Host ""

# 1. Clean build artifacts
Write-Host "1️⃣  Cleaning build artifacts..." -ForegroundColor Yellow
$distPath = "c:\Users\Administrator\Desktop\stableclaw\dist"
if (Test-Path $distPath) {
    Remove-Item -Path $distPath -Recurse -Force
    Write-Host "   ✓ Removed dist directory" -ForegroundColor Green
}

# 2. Rebuild project
Write-Host ""
Write-Host "2️⃣  Rebuilding project..." -ForegroundColor Yellow
Set-Location "c:\Users\Administrator\Desktop\stableclaw"
pnpm build
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Build completed" -ForegroundColor Green
} else {
    Write-Host "   ✗ Build failed" -ForegroundColor Red
    exit 1
}

# 3. Build Control UI
Write-Host ""
Write-Host "3️⃣  Building Control UI..." -ForegroundColor Yellow
node scripts/ui.js build
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Control UI build completed" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Control UI build failed (non-critical, gateway can still run)" -ForegroundColor Yellow
}

# 4. Verify builds
Write-Host ""
Write-Host "4️⃣  Verifying builds..." -ForegroundColor Yellow

# Check dist
if (Test-Path "c:\Users\Administrator\Desktop\stableclaw\dist\index.js") {
    Write-Host "   ✓ Main dist files exist" -ForegroundColor Green
} else {
    Write-Host "   ✗ Main dist files missing" -ForegroundColor Red
    exit 1
}

# Check Control UI
$controlUiPath = "c:\Users\Administrator\Desktop\stableclaw\dist\control-ui\index.html"
if (Test-Path $controlUiPath) {
    Write-Host "   ✓ Control UI files exist" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Control UI files missing (non-critical)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Quick fix completed!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Restart gateway: pnpm openclaw gateway run --bind loopback --port 18789" -ForegroundColor Gray
Write-Host "  2. Check logs for improvements" -ForegroundColor Gray
