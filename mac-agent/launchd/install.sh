#!/usr/bin/env bash
# Installs the agent as a LaunchAgent: starts at login, restarts if it dies.
#   launchd/install.sh            install and start
#   launchd/install.sh uninstall  stop and remove
set -euo pipefail
LABEL=app.solowey.busybar-status-agent
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$TARGET"
  echo "removed $LABEL"
  exit 0
fi

# Node 24 from nvm if present, else whatever `node` is on PATH.
NODE="$(ls -d "$HOME"/.nvm/versions/node/v24.*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
NODE="${NODE:-$(command -v node)}"
[[ -x "$NODE" ]] || { echo "node not found" >&2; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s|__NODE__|$NODE|g" -e "s|__DIR__|$DIR|g" -e "s|__HOME__|$HOME|g" "$DIR/launchd/$LABEL.plist" > "$TARGET"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"
echo "installed $LABEL (node: $NODE), log: ~/Library/Logs/busybar-status-agent.log"
