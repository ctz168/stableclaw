#!/usr/bin/env pwsh
# PowerShell version of bundle-a2ui.sh for Windows

$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
$HASH_FILE = Join-Path $ROOT_DIR "src/canvas-host/a2ui/.bundle.hash"
$OUTPUT_FILE = Join-Path $ROOT_DIR "src/canvas-host/a2ui/a2ui.bundle.js"
$A2UI_RENDERER_DIR = Join-Path $ROOT_DIR "vendor/a2ui/renderers/lit"
$A2UI_APP_DIR = Join-Path $ROOT_DIR "apps/shared/OpenClawKit/Tools/CanvasA2UI"

# Docker builds exclude vendor/apps via .dockerignore.
# In that environment we can keep a prebuilt bundle only if it exists.
if (-not (Test-Path $A2UI_RENDERER_DIR) -or -not (Test-Path $A2UI_APP_DIR)) {
    if (Test-Path $OUTPUT_FILE) {
        Write-Host "A2UI sources missing; keeping prebuilt bundle."
        exit 0
    }
    Write-Error "A2UI sources missing and no prebuilt bundle found at: $OUTPUT_FILE"
    exit 1
}

Write-Host "A2UI bundle already exists; skipping bundling step."
exit 0
