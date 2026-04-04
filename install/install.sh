#!/bin/bash
set -euo pipefail

# StableClaw Installer for macOS and Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.sh | bash
#    or: curl -fsSL https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.sh | bash -s -- --install-method git

BOLD='\033[1m'
ACCENT='\033[0;36m'       # cyan
INFO='\033[0;90m'         # gray
SUCCESS='\033[0;32m'      # green
WARN='\033[0;33m'         # yellow
ERROR='\033[0;31m'        # red
NC='\033[0m'              # no color

# ── defaults ──────────────────────────────────────────────
TAG="latest"
INSTALL_METHOD="npm"
GIT_DIR=""
NO_ONBOARD=false
NO_GIT_UPDATE=false
DRY_RUN=false
SCRIPT_URL="https://raw.githubusercontent.com/ctz168/stableclaw/main/install/install.sh"

# ── parse args ────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --tag=*)       TAG="${arg#*=}" ;;
    --install-method=*) INSTALL_METHOD="${arg#*=}" ;;
    --git-dir=*)   GIT_DIR="${arg#*=}" ;;
    --no-onboard)  NO_ONBOARD=true ;;
    --no-git-update) NO_GIT_UPDATE=true ;;
    --dry-run)     DRY_RUN=true ;;
    --help|-h)
      echo "StableClaw Installer"
      echo ""
      echo "Usage: curl -fsSL $SCRIPT_URL | bash [-s -- OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --tag=VERSION         Install specific version (default: latest)"
      echo "  --install-method=npm  Install via npm (default)"
      echo "  --install-method=git  Install from GitHub source"
      echo "  --git-dir=PATH        Clone destination (default: ~/stableclaw)"
      echo "  --no-onboard          Skip interactive setup wizard"
      echo "  --no-git-update       Skip git pull on existing clone"
      echo "  --dry-run             Show what would be done"
      echo ""
      exit 0
      ;;
    *) echo "Unknown option: $arg (use --help)"; exit 2 ;;
  esac
done

# ── helpers ───────────────────────────────────────────────
info()    { echo -e "${INFO}[i]${NC} $*"; }
success() { echo -e "${SUCCESS}[OK]${NC} $*"; }
warn()    { echo -e "${WARN}[!]${NC} $*"; }
err()     { echo -e "${ERROR}[ERR]${NC} $*" >&2; }
step()    { echo -e "${ACCENT}[*]${NC} $*"; }

# ── detect OS ─────────────────────────────────────────────
detect_os() {
  local os
  os="$(uname -s)"
  case "$os" in
    Linux*)   echo "linux" ;;
    Darwin*)  echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

OS="$(detect_os)"
echo -e "\n  ${BOLD}🦞 StableClaw Installer${NC}\n"
success "$OS detected"

# ── dry run check ─────────────────────────────────────────
if $DRY_RUN; then
  success "Dry run"
  success "Install method: $INSTALL_METHOD"
  success "Tag: $TAG"
  if [ "$INSTALL_METHOD" = "git" ]; then
    success "Git dir: ${GIT_DIR:-~/stableclaw}"
    success "Git update: $(if $NO_GIT_UPDATE; then echo 'disabled'; else echo 'enabled'; fi)"
  fi
  $NO_ONBOARD && success "Onboard: skipped"
  exit 0
fi

# ── downloader ────────────────────────────────────────────
DOWNLOADER=""
detect_downloader() {
  if command -v curl &>/dev/null; then
    DOWNLOADER="curl"
  elif command -v wget &>/dev/null; then
    DOWNLOADER="wget"
  else
    err "curl or wget is required"
    exit 1
  fi
}

download_file() {
  local url="$1" output="$2"
  if [ -z "$DOWNLOADER" ]; then detect_downloader; fi
  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fsSL --proto '=https' --tlsv1.2 --retry 3 --retry-delay 1 -o "$output" "$url"
  else
    wget -q --https-only --secure-protocol=TLSv1_2 --tries=3 --timeout=20 -O "$output" "$url"
  fi
}

# ── Node.js ───────────────────────────────────────────────
check_node() {
  if ! command -v node &>/dev/null; then return 1; fi
  local major
  major="$(node -v | sed 's/v\([0-9]\+\).*/\1/')"
  if [ "$major" -ge 22 ] 2>/dev/null; then
    success "Node.js $(node -v) found"
    return 0
  fi
  warn "Node.js $(node -v) found, but v22+ required"
  return 1
}

install_node() {
  step "Installing Node.js 22+ ..."

  if [ "$OS" = "macos" ]; then
    if command -v brew &>/dev/null; then
      info "Using Homebrew..."
      brew install node@22 || brew install node
      export PATH="$(brew --prefix node)/bin:$PATH"
      if check_node; then return 0; fi
    fi
  fi

  if [ "$OS" = "linux" ]; then
    if command -v apt-get &>/dev/null && [ "$(id -u)" -eq 0 ]; then
      info "Using apt..."
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y nodejs
      if check_node; then return 0; fi
    fi
    if command -v dnf &>/dev/null && [ "$(id -u)" -eq 0 ]; then
      info "Using dnf..."
      dnf install -y nodejs || dnf install -y nodejs22
      if check_node; then return 0; fi
    fi
    if command -v pacman &>/dev/null && [ "$(id -u)" -eq 0 ]; then
      info "Using pacman..."
      pacman -S --noconfirm nodejs
      if check_node; then return 0; fi
    fi
    # Try fnm (user-level)
    if command -v fnm &>/dev/null; then
      info "Using fnm..."
      fnm install 22
      eval "$(fnm env)"
      if check_node; then return 0; fi
    fi
    # Try nvm
    if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
      info "Using nvm..."
      # shellcheck source=/dev/null
      source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
      nvm install 22
      if check_node; then return 0; fi
    fi
  fi

  err "Could not auto-install Node.js."
  echo ""
  echo "Please install Node.js 22+ manually:"
  echo "  https://nodejs.org/en/download/"
  echo ""
  echo "Or install fnm (recommended):"
  if [ "$OS" = "macos" ]; then
    echo "  brew install fnm && fnm install 22"
  else
    echo '  curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22'
  fi
  exit 1
}

# ── Git ───────────────────────────────────────────────────
ensure_git() {
  if command -v git &>/dev/null; then return 0; fi
  err "Git is required. Install it first:"
  if [ "$OS" = "macos" ]; then
    echo "  brew install git"
  elif [ "$OS" = "linux" ]; then
    echo "  sudo apt-get install git   # Debian/Ubuntu"
    echo "  sudo dnf install git        # Fedora"
    echo "  sudo pacman -S git          # Arch"
  fi
  exit 1
}

# ── pnpm ──────────────────────────────────────────────────
ensure_pnpm() {
  if command -v pnpm &>/dev/null; then return 0; fi
  step "Installing pnpm..."
  if command -v corepack &>/dev/null; then
    corepack enable
    corepack prepare pnpm@latest --activate
    if command -v pnpm &>/dev/null; then return 0; fi
  fi
  npm install -g pnpm
  if command -v pnpm &>/dev/null; then return 0; fi
  err "Failed to install pnpm"
  exit 1
}

# ── check existing ────────────────────────────────────────
check_existing() {
  if command -v stableclaw &>/dev/null; then
    warn "Existing StableClaw installation detected"
    return 0
  fi
  return 1
}

# ── install from npm ──────────────────────────────────────
install_from_npm() {
  step "Installing StableClaw (stableclaw@$TAG) via npm..."
  npm install -g "stableclaw@$TAG"
  success "StableClaw installed"
}

# ── install from git ──────────────────────────────────────
install_from_git() {
  local repo_dir="${GIT_DIR:-$HOME/stableclaw}"
  local repo_url="https://github.com/ctz168/stableclaw.git"

  ensure_git
  ensure_pnpm

  step "Installing StableClaw from GitHub ($repo_url)..."

  if [ ! -d "$repo_dir" ]; then
    git clone "$repo_url" "$repo_dir"
  fi

  if ! $NO_GIT_UPDATE; then
    if [ -z "$(git -C "$repo_dir" status --porcelain 2>/dev/null)" ]; then
      git -C "$repo_dir" pull --rebase 2>/dev/null || warn "git pull skipped"
    else
      warn "Repo is dirty; skipping git pull"
    fi
  fi

  cd "$repo_dir"
  pnpm install
  pnpm build

  # Create wrapper
  local bin_dir="$HOME/.local/bin"
  mkdir -p "$bin_dir"
  cat > "$bin_dir/stableclaw" << WRAPPER
#!/bin/bash
exec node "$repo_dir/dist/entry.js" "\$@"
WRAPPER
  chmod +x "$bin_dir/stableclaw"

  # Ensure on PATH
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) export PATH="$bin_dir:$PATH"
       warn "Added $bin_dir to PATH. Restart your shell if needed." ;;
  esac

  success "StableClaw installed from source"
  info "Source: $repo_dir"
  info "Wrapper: $bin_dir/stableclaw"
}

# ── refresh gateway if running ────────────────────────────
refresh_gateway() {
  if ! command -v stableclaw &>/dev/null; then return 0; fi
  local svc
  svc="$(stableclaw daemon status --json 2>/dev/null || true)"
  if echo "$svc" | grep -q '"loaded".*true'; then
    step "Gateway service is running — refreshing..."
    stableclaw gateway install --force 2>/dev/null || true
    stableclaw gateway restart 2>/dev/null || true
    success "Gateway service refreshed"
  fi
}

# ── main ──────────────────────────────────────────────────
main() {
  is_upgrade=false
  check_existing && is_upgrade=true

  # 1. Node.js
  if ! check_node; then
    install_node
    if ! check_node; then
      err "Node.js installation may require a terminal restart."
      err "Close this terminal, open a new one, and re-run this installer."
      exit 1
    fi
  fi

  # 2. StableClaw
  case "$INSTALL_METHOD" in
    git) install_from_git ;;
    npm) install_from_npm ;;
    *)   err "Invalid install method: $INSTALL_METHOD"; exit 2 ;;
  esac

  # 3. Ensure on PATH
  if ! command -v stableclaw &>/dev/null; then
    warn "stableclaw is not on PATH yet."
    warn "Open a new terminal, then run: stableclaw doctor"
    return 0
  fi

  # 4. Refresh gateway if running
  refresh_gateway

  # 5. Run doctor if upgrade
  if $is_upgrade; then
    step "Running doctor for migrations..."
    stableclaw doctor --non-interactive 2>/dev/null || true
  fi

  # 6. Done
  local version
  version="$(stableclaw --version 2>/dev/null | head -1 || true)"

  echo ""
  if [ -n "$version" ]; then
    success "StableClaw $version installed successfully!"
  else
    success "StableClaw installed successfully!"
  fi
  echo ""

  if $is_upgrade; then
    echo -e "  Run ${ACCENT}stableclaw doctor${NC} to check for additional migrations."
  else
    if $NO_ONBOARD; then
      echo -e "  Run ${ACCENT}stableclaw onboard${NC} later to complete setup."
    else
      echo -e "  ${ACCENT}Starting setup...${NC}"
      echo ""
      stableclaw onboard
    fi
  fi
}

main
