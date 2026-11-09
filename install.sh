#!/usr/bin/env bash
# DeepSeek Harness (CachyOS fork) — Linux desktop one-command installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/mannnrachman/deepseek-harness-cachyos/master/install.sh | bash
#
# Environment variables:
#   DSH_DIR      Checkout target (default: $HOME/deepseek-harness-cachyos)
#   INSTALL_DIR  Desktop install target (default: $HOME/.local/opt/deepseek-harness)

set -euo pipefail

DSH_DIR="${DSH_DIR:-$HOME/deepseek-harness-cachyos}"
REPO_URL="https://github.com/mannnrachman/deepseek-harness-cachyos.git"

ARCH="$(uname -m)"
[ "$ARCH" = "x86_64" ] || { echo "ERROR: only x86_64 Linux is supported (detected $ARCH)"; exit 1; }

if [ -d "$DSH_DIR/.git" ]; then
  echo "==> Existing checkout found at $DSH_DIR — reusing it"
else
  echo "==> Cloning $REPO_URL into $DSH_DIR"
  git clone "$REPO_URL" "$DSH_DIR"
fi

echo "==> Installing prerequisites, dependencies and build (several minutes)"
"$DSH_DIR/dsh.sh" install

echo "==> Building and installing the desktop app"
"$DSH_DIR/dsh.sh" desktop-install

cat <<EOF

Installation complete.

  Application menu : "DeepSeek Harness"
  Direct launch    : $HOME/.local/opt/deepseek-harness/deepseek-harness
  Web UI           : cd $DSH_DIR && ./dsh.sh web
  Update anytime   : $DSH_DIR/dsh.sh update
  Environment      : cd $DSH_DIR && ./dsh.sh doctor
EOF
