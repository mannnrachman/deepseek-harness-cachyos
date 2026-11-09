#!/usr/bin/env sh
# Kept for compatibility with earlier instructions — delegates to ./dsh.sh update.
exec "$(dirname "$0")/dsh.sh" update "$@"
