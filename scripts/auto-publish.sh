#!/bin/bash
# StableClaw Auto Publish Script
# Triggered every 30 minutes by cron
# Bumps version, builds, publishes to npm, updates 发布注意事项.md

set -euo pipefail

REPO_DIR="/home/z/my-project/stableclaw"
GIT_TOKEN="${GITHUB_TOKEN}"  # Set via environment variable
NPM_TOKEN="${NPM_PUBLISH_TOKEN}"  # Set via environment variable
LOG_FILE="/tmp/stableclaw-auto-publish.log"
PUBLISH_NOTES="$REPO_DIR/发布注意事项.md"
export PATH="$HOME/.npm-global/bin:$PATH"

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

log "=== Starting auto-publish cycle ==="

cd "$REPO_DIR"

# 1. Pull latest code first
log "Pulling latest code..."
git pull "https://${GIT_TOKEN}@github.com/ctz168/stableclaw.git" main --rebase 2>&1 | tee -a "$LOG_FILE" || {
  log "ERROR: git pull failed"
  exit 1
}

# 2. Check current version on npm
CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")
NPM_VERSION=$(npm view stableclaw version 2>&1 || echo "unknown")

log "Current local version: $CURRENT_VERSION"
log "Current npm version: $NPM_VERSION"

if [ "$CURRENT_VERSION" = "$NPM_VERSION" ]; then
  log "Version $CURRENT_VERSION already published. Bumping..."
  # Bump version: increment the MINOR part (last number)
  # Format: YYYY.M.MINOR -> increment MINOR
  YEAR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
  MONTH=$(echo "$CURRENT_VERSION" | cut -d. -f2)
  MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f3)
  NEW_MINOR=$((MINOR + 1))
  NEW_VERSION="${YEAR}.${MONTH}.${NEW_MINOR}"
  
  log "New version: $NEW_VERSION"
  
  # Update package.json version
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  
  # Update build stamp
  node scripts/build-stamp.mjs 2>&1 | tee -a "$LOG_FILE" || true
  
  # Commit version bump
  git add package.json
  git commit -m "chore: bump version to $NEW_VERSION" 2>&1 | tee -a "$LOG_FILE" || {
    log "Nothing to commit (version already bumped)"
  }
  git push "https://${GIT_TOKEN}@github.com/ctz168/stableclaw.git" main 2>&1 | tee -a "$LOG_FILE"
else
  log "Local version $CURRENT_VERSION differs from npm $NPM_VERSION. Publishing current version."
fi

# 3. Run full build
log "Running full build..."
BUILD_OUTPUT=$(pnpm build 2>&1)
echo "$BUILD_OUTPUT" | tail -10 | tee -a "$LOG_FILE"

if echo "$BUILD_OUTPUT" | rg -q "error|Error|ERROR"; then
  log "BUILD FAILED! Aborting publish."
  # Update 发布注意事项.md with deployment failure
  cat >> "$PUBLISH_NOTES" << EOF

### 部署失败记录 $(date -Iseconds)

**版本**: $(node -e "console.log(require('./package.json').version)")
**错误**: 构建失败
**详情**:
$(echo "$BUILD_OUTPUT" | rg "error|Error" | head -10)
EOF
  git add "$PUBLISH_NOTES"
  git commit -m "auto: record deployment failure [$(date +%Y%m%d%H%M%S)]" 2>&1 | tee -a "$LOG_FILE"
  git push "https://${GIT_TOKEN}@github.com/ctz168/stableclaw.git" main 2>&1 | tee -a "$LOG_FILE"
  exit 1
fi

# 4. Build UI
log "Building UI..."
UI_OUTPUT=$(pnpm ui:build 2>&1)
echo "$UI_OUTPUT" | tail -5 | tee -a "$LOG_FILE"

# 5. Verify build artifacts
log "Verifying build artifacts..."
MISSING=""
for f in dist/entry.js dist/index.js dist/control-ui/index.html; do
  if [ ! -f "$f" ]; then
    MISSING="$MISSING $f"
  fi
done

if [ -n "$MISSING" ]; then
  log "MISSING BUILD ARTIFACTS:$MISSING. Aborting publish."
  exit 1
fi

log "All build artifacts present."

# 6. Configure npm auth
log "Configuring npm authentication..."
npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN" 2>&1 | tee -a "$LOG_FILE"

# 7. Publish to npm
log "Publishing to npm..."
PUBLISH_OUTPUT=$(npm publish --access public 2>&1)
PUBLISH_EXIT=$?
echo "$PUBLISH_OUTPUT" | tee -a "$LOG_FILE"

# Clean npm token
npm config delete //registry.npmjs.org/:_authToken 2>/dev/null || true

if [ $PUBLISH_EXIT -ne 0 ]; then
  # Check if it's just a timeout but actually published
  PUBLISHED_VERSION=$(npm view stableclaw version 2>&1 || echo "unknown")
  LOCAL_VERSION=$(node -e "console.log(require('./package.json').version)")
  
  if [ "$PUBLISHED_VERSION" = "$LOCAL_VERSION" ]; then
    log "Publish CLI timed out but version $LOCAL_VERSION is already on npm. Success."
  else
    log "PUBLISH FAILED!"
    cat >> "$PUBLISH_NOTES" << EOF

### 部署失败记录 $(date -Iseconds)

**版本**: $LOCAL_VERSION
**错误**: npm publish 失败
**详情**: $(echo "$PUBLISH_OUTPUT" | tail -10)
EOF
    git add "$PUBLISH_NOTES"
    git commit -m "auto: record deployment failure [$(date +%Y%m%d%H%M%S)]" 2>&1 | tee -a "$LOG_FILE"
    git push "https://${GIT_TOKEN}@github.com/ctz168/stableclaw.git" main 2>&1 | tee -a "$LOG_FILE"
    exit 1
  fi
fi

# 8. Verify published version
PUBLISHED=$(npm view stableclaw version 2>&1)
log "Published version: $PUBLISHED"

# 9. Push code
log "Pushing code to git..."
git push "https://${GIT_TOKEN}@github.com/ctz168/stableclaw.git" main 2>&1 | tee -a "$LOG_FILE" || {
  log "Git push warning (may have been pushed already)"
}

log "=== Auto-publish cycle complete: v$PUBLISHED ==="
