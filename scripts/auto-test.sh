#!/bin/bash
# StableClaw Auto Test Script
# Triggered every 3 minutes by cron
# Pulls latest code, analyzes changes, runs tests, updates bugs.md

set -euo pipefail

REPO_DIR="/home/z/my-project/stableclaw"
GIT_TOKEN="${GITHUB_TOKEN}"  # Set via environment variable
LOG_FILE="/tmp/stableclaw-auto-test.log"
BUGS_FILE="$REPO_DIR/bugs.md"
export PATH="$HOME/.npm-global/bin:$PATH"

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

log "=== Starting auto-test cycle ==="

cd "$REPO_DIR"

# 1. Pull latest code
log "Pulling latest code..."
git fetch origin main 2>&1 | tee -a "$LOG_FILE" || {
  log "ERROR: git fetch failed"
  exit 1
}

# Check if there are new commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  log "No new commits. Skipping."
  exit 0
fi

log "New commits found: $LOCAL -> $REMOTE"

# Get changed files
CHANGED_FILES=$(git diff --name-only "$LOCAL" "$REMOTE" 2>&1)
log "Changed files: $CHANGED_FILES"

# 2. Pull and rebase
git pull --rebase origin main 2>&1 | tee -a "$LOG_FILE" || {
  log "ERROR: git pull failed"
  exit 1
}

# 3. Install dependencies if package.json changed
if echo "$CHANGED_FILES" | rg -q "package\.json|pnpm-lock\.yaml"; then
  log "Dependency changes detected. Running pnpm install..."
  pnpm install 2>&1 | tail -5 | tee -a "$LOG_FILE"
fi

# 4. Build if source files changed
if echo "$CHANGED_FILES" | rg -q "src/|extensions/|scripts/"; then
  log "Source changes detected. Running build..."
  BUILD_OUTPUT=$(pnpm build 2>&1)
  echo "$BUILD_OUTPUT" | tail -10 | tee -a "$LOG_FILE"
  
  if echo "$BUILD_OUTPUT" | rg -q "error|Error|ERROR"; then
    log "BUILD FAILED! Adding to bugs.md"
    NEW_BUG="### BUG-AUTO-$(date +%s): Build failure after git pull
- **Severity**: Critical
- **Component**: Build system
- **Description**: \`pnpm build\` failed after pulling latest changes.
- **Changed files**: $CHANGED_FILES
- **Error output**: $(echo "$BUILD_OUTPUT" | rg "error|Error" | head -5)
- **Status**: Open
- **Time**: $(date -Iseconds)
"
    # Prepend to bugs.md
    echo "$NEW_BUG" | cat - "$BUGS_FILE" > /tmp/bugs-tmp.md && mv /tmp/bugs-tmp.md "$BUGS_FILE"
  fi
fi

# 5. Run tests if test files or related source changed
TEST_FILES_CHANGED=$(echo "$CHANGED_FILES" | rg -c "\.test\.|\.suite\.|\.spec\." || true)
SRC_CHANGED=$(echo "$CHANGED_FILES" | rg -c "src/" || true)

if [ "$TEST_FILES_CHANGED" -gt 0 ] || [ "$SRC_CHANGED" -gt 0 ]; then
  log "Running test suite..."
  TEST_OUTPUT=$(pnpm vitest run 2>&1 || true)
  echo "$TEST_OUTPUT" | tail -20 | tee -a "$LOG_FILE"
  
  FAILED_COUNT=$(echo "$TEST_OUTPUT" | rg -o "(\d+) failed" | head -1 | rg -o "\d+" || echo "0")
  if [ "$FAILED_COUNT" -gt 0 ]; then
    log "TEST FAILURES: $FAILED_COUNT tests failed"
    NEW_BUG="### BUG-AUTO-$(date +%s): Test failures after git pull
- **Severity**: High
- **Component**: Test suite
- **Description**: $FAILED_COUNT test(s) failed after pulling latest changes.
- **Changed files**: $CHANGED_FILES
- **Test output**: $(echo "$TEST_OUTPUT" | tail -20)
- **Status**: Open
- **Time**: $(date -Iseconds)
"
    echo "$NEW_BUG" | cat - "$BUGS_FILE" > /tmp/bugs-tmp.md && mv /tmp/bugs-tmp.md "$BUGS_FILE"
  fi
fi

# 6. Commit and push bugs.md if changed
if git diff --quiet "$BUGS_FILE"; then
  log "No changes to bugs.md"
else
  log "bugs.md updated. Committing and pushing..."
  git add bugs.md
  git commit -m "auto: update bugs.md after code pull and test [$(date +%Y%m%d%H%M%S)]" 2>&1 | tee -a "$LOG_FILE"
  git push "https://${GIT_TOKEN}@github.com/ctz168/stableclaw.git" main 2>&1 | tee -a "$LOG_FILE" || {
    log "ERROR: git push failed"
  }
fi

log "=== Auto-test cycle complete ==="
