#!/usr/bin/env bash
# DeepSeek Harness (CachyOS fork) — one entry point for every everyday command.
#
# Usage: ./dsh.sh <command> [args...]
#   install          First-time setup: prerequisites, dependencies, full build
#   build            Build web + desktop artifacts
#   web [args...]    Run the Web UI (http://127.0.0.1:3080, prints its token URL)
#   desktop [args...] Run the Electron desktop window (development layout)
#   package          Build the packaged Linux desktop app directory
#   desktop-install  Package + install to $INSTALL_DIR + refresh the menu entry
#   update           Pull origin/master, rebuild, reinstall the desktop app
#   doctor           Print environment status
#   help             This text
#
# Environment:
#   INSTALL_DIR            Desktop install target (default ~/.local/opt/deepseek-harness)
#   BIN_DIR                Launcher directory (default ~/.local/bin)
#   DSH_ELECTRON_MIRROR    Electron download mirror (default npmmirror; set empty to disable)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/opt/deepseek-harness}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
REPO_URL="https://github.com/mannnrachman/deepseek-harness-cachyos.git"

if [ "${DSH_ELECTRON_MIRROR:-npmmirror}" = "npmmirror" ]; then
  export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
  export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
fi

BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
info() { printf '%s==>%s %s\n' "$BLUE" "$NC" "$*"; }
ok()   { printf '%s==>%s %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%sWARNING:%s %s\n' "$YELLOW" "$NC" "$*"; }
die()  { printf '%sERROR:%s %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major minor
  major="$(node -p 'process.versions.node.split(".")[0]')"
  minor="$(node -p 'process.versions.node.split(".")[1]')"
  [ "$major" -gt 24 ] || { [ "$major" -eq 24 ] && [ "$minor" -ge 9 ]; }
}

ensure_prerequisites() {
  local missing=()
  command -v git >/dev/null 2>&1 || missing+=(git)
  node_ok || missing+=(nodejs)
  command -v npm >/dev/null 2>&1 || missing+=(npm)
  command -v pnpm >/dev/null 2>&1 || missing+=(pnpm)
  command -v make >/dev/null 2>&1 || missing+=(base-devel)
  python3 --version >/dev/null 2>&1 || missing+=(python)
  if [ "${#missing[@]}" -gt 0 ]; then
    if command -v pacman >/dev/null 2>&1; then
      info "Installing missing packages via pacman: ${missing[*]}"
      sudo pacman -S --needed --noconfirm "${missing[@]}"
    else
      die "Missing tools: ${missing[*]}. Install Node.js >= 24.9, pnpm, git, a C toolchain and python3, then rerun."
    fi
  fi
  node_ok || die "Node.js >= 24.9 is required (found $(node -v 2>/dev/null || echo none))."
  if [ "$(pnpm --version 2>/dev/null)" != '11.28.5' ]; then
    info "pnpm will switch to the repository's pinned version (11.28.5) automatically during install."
  fi
}

ensure_repo_root() {
  [ -f "$ROOT/package.json" ] && [ -d "$ROOT/apps/desktop" ] || die "Run this script from a deepseek-harness checkout."
}

cmd_install() {
  ensure_prerequisites
  info "Installing dependencies (pnpm install --frozen-lockfile)..."
  (cd "$ROOT" && pnpm install --frozen-lockfile)
  info "Fetching the locked Electron binary..."
  (cd "$ROOT" && pnpm --filter @deepseek-ai/dsh-desktop exec install-electron)
  info "Building web + desktop artifacts (several minutes)..."
  (cd "$ROOT" && pnpm run build)
  ok "Source checkout ready. Try: ./dsh.sh web  |  ./dsh.sh desktop  |  ./dsh.sh desktop-install"
}

cmd_build() {
  (cd "$ROOT" && pnpm run build)
  ok "Build complete."
}

cmd_web() {
  info "Starting the Web UI on http://127.0.0.1:3080 (token URL printed below; changes every restart)"
  (cd "$ROOT" && pnpm run start:web "$@")
}

cmd_desktop() {
  (cd "$ROOT" && pnpm run start:desktop "$@")
}

cmd_package() {
  (cd "$ROOT" && pnpm run package:desktop:linux:x64:dir)
  ok "Packaged app directory: $ROOT/apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/linux-unpacked"
}

cmd_desktop_install() {
  cmd_package
  local src="$ROOT/apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/linux-unpacked"
  info "Installing to $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  cp -a "$src" "$INSTALL_DIR"
  mkdir -p "$BIN_DIR" "$DESKTOP_DIR"
  cat > "$DESKTOP_DIR/deepseek-harness.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=DeepSeek Harness
Comment=DeepSeek Harness desktop app (locally built)
Exec=$INSTALL_DIR/deepseek-harness
Icon=$INSTALL_DIR/resources/icon.png
Terminal=false
Categories=Development;
EOF
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  ok "Installed. Launch 'DeepSeek Harness' from the menu, or: $INSTALL_DIR/deepseek-harness"
}

cmd_update() {
  info "Pulling origin/master (rebasing local commits)"
  (cd "$ROOT" && git pull --rebase origin master)
  info "Syncing dependencies"
  (cd "$ROOT" && pnpm install --frozen-lockfile)
  cmd_desktop_install
  echo
  ok "Update complete. Restart the desktop app or the web UI to pick up the new version."
}

cmd_doctor() {
  local status
  status="$(command -v node >/dev/null 2>&1 && node -v || echo missing)"
  printf 'node            : %s\n' "$status"
  node_ok || printf '                  %srequires >= 24.9%s\n' "$YELLOW" "$NC"
  printf 'pnpm            : %s\n' "$(command -v pnpm >/dev/null 2>&1 && pnpm --version || echo missing)"
  printf 'git             : %s\n' "$(command -v git >/dev/null 2>&1 && git --version || echo missing)"
  printf 'libvips (system): %s\n' "$(pkg-config --modversion vips-cpp 2>/dev/null || echo 'not installed (not required)')"
  printf 'electron mirror : %s\n' "${ELECTRON_MIRROR:-unset}"
  printf 'checkout        : %s\n' "$ROOT"
  if [ -f "$ROOT/apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/linux-unpacked/deepseek-harness" ]; then
    printf 'packaged app    : built (targets/linux-x64/unsigned-artifacts/linux-unpacked)\n'
  else
    printf 'packaged app    : not built yet (run: ./dsh.sh desktop-install)\n'
  fi
  if [ -x "$INSTALL_DIR/deepseek-harness" ]; then
    printf 'installed app   : %s\n' "$INSTALL_DIR"
  else
    printf 'installed app   : not installed (run: ./dsh.sh desktop-install)\n'
  fi
  if [ -f "$DESKTOP_DIR/deepseek-harness.desktop" ]; then
    printf 'menu entry      : %s\n' "$DESKTOP_DIR/deepseek-harness.desktop"
  else
    printf 'menu entry      : missing\n'
  fi
  printf 'running         : %s\n' "$(pgrep -fc 'deepseek-harness|electron.*apps/desktop' 2>/dev/null || echo 0) matching process(es)"
}

cmd_help() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  echo
  echo "Typical first run:  git clone $REPO_URL && cd deepseek-harness-cachyos && ./dsh.sh install"
}

case "${1:-help}" in
  install)         shift; cmd_install "$@" ;;
  build)           shift; cmd_build "$@" ;;
  web)             shift; cmd_web "$@" ;;
  desktop)         shift; cmd_desktop "$@" ;;
  package)         shift; cmd_package "$@" ;;
  desktop-install) shift; cmd_desktop_install "$@" ;;
  update)          shift; cmd_update "$@" ;;
  doctor)          shift; cmd_doctor "$@" ;;
  help|--help|-h)  cmd_help ;;
  *) cmd_help; die "Unknown command: ${1:-}" ;;
esac
