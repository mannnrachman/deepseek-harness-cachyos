#!/usr/bin/env sh
# Update the DeepSeek Harness desktop checkout (fork: mannnrachman/deepseek-harness),
# rebuild, package the Linux desktop app, and reinstall it locally.
#
# Usage: ./update-desktop.sh
#
# The packaged app is installed to ~/.local/opt/deepseek-harness and the menu
# entry "DeepSeek Harness" points at it. Web UI stays available via
#   pnpm dsh web   (http://127.0.0.1:3080)
set -e
cd "$(dirname "$0")"
INSTALL_DIR="$HOME/.local/opt/deepseek-harness"
TARGET_DIR="apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/linux-unpacked"

echo "==> Pulling origin/master (rebase local commits on top)"
git pull --rebase origin master

echo "==> Syncing dependencies"
pnpm install --frozen-lockfile

echo "==> Building and packaging the Linux desktop app (unsigned, local)"
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
pnpm run package:desktop:linux:x64:dir

echo "==> Installing to $INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR"
cp -a "$TARGET_DIR" "$INSTALL_DIR"

DESKTOP_FILE="$HOME/.local/share/applications/deepseek-harness.desktop"
mkdir -p "$(dirname "$DESKTOP_FILE")"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=DeepSeek Harness
Comment=DeepSeek Harness desktop app (locally built)
Exec=$INSTALL_DIR/deepseek-harness
Icon=$INSTALL_DIR/resources/icon.png
Terminal=false
Categories=Development;
EOF
update-desktop-database "$(dirname "$DESKTOP_FILE")" 2>/dev/null || true

echo
echo "Done. Launch 'DeepSeek Harness' from the application menu, or run: $INSTALL_DIR/deepseek-harness"
