#!/usr/bin/env sh
# Update the DeepSeek Harness desktop checkout (fork: mannnrachman/deepseek-harness)
# and rebuild its artifacts. Run from anywhere; it always operates on this repository.
#
# Usage: ./update-desktop.sh
set -e
cd "$(dirname "$0")"

echo "==> Pulling origin/master (rebase local commits on top)"
git pull --rebase origin master

echo "==> Syncing dependencies"
pnpm install --frozen-lockfile

echo "==> Building web + desktop artifacts"
pnpm run build

echo
echo "Done. Launch the desktop app with:  pnpm run start:desktop"
echo "First launch after an update may re-prepare the bundled runtime (a few minutes)."
