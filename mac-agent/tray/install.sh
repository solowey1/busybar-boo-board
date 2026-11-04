#!/usr/bin/env bash
# Builds the menu-bar app, puts it in ~/Applications and starts it.
#   tray/install.sh            build, install and start
#   tray/install.sh uninstall  stop and remove
# Starting it at login is a switch in the app's menu and on its settings page.
set -euo pipefail
APP="$HOME/Applications/Busybar status.app"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

stop() {
  pkill -f "Busybar status.app/Contents/MacOS/BusyBarStatus" 2>/dev/null || true
  pkill -f "$DIR/src/index.mjs" 2>/dev/null || true
}

if [[ "${1:-}" == "uninstall" ]]; then
  stop
  rm -rf "$APP"
  echo "removed $APP (a login item, if you had one, disappears with the app)"
  exit 0
fi

# Node 24 from nvm if present, else whatever `node` is on PATH.
NODE="$(ls -d "$HOME"/.nvm/versions/node/v24.*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
NODE="${NODE:-$(command -v node)}"
[[ -x "$NODE" ]] || { echo "node not found" >&2; exit 1; }

stop
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$HOME/Applications" "$HOME/.config/busybar-status"

cp "$DIR/tray/Info.plist" "$APP/Contents/Info.plist"
/usr/bin/swiftc -O -o "$APP/Contents/MacOS/BusyBarStatus" "$DIR/tray/BusyBarStatus.swift"

# Icons: the menu-bar ones, and the app's own.
"$NODE" "$DIR/tools/icons.mjs" tray "$APP/Contents/Resources"
ICONSET="$(mktemp -d)/AppIcon.iconset"
"$NODE" "$DIR/tools/icons.mjs" iconset "$ICONSET"
/usr/bin/iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

# An ad-hoc signature gives the app a stable identity for the privacy prompts.
/usr/bin/codesign --force --deep --sign - "$APP"

printf '{ "node": "%s", "entry": "%s" }\n' "$NODE" "$DIR/src/index.mjs" > "$HOME/.config/busybar-status/tray.json"

/usr/bin/open "$APP"
echo "installed and started: $APP (node: $NODE), log: ~/Library/Logs/busybar-status.log"
