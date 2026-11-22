#!/bin/zsh
# One-time opt-in: keep LectureMate server alive at login, and pull main repo updates every five minutes.
# This executes updated GitHub code using your local user account. Only run for repositories you control.
set -eu
root="${0:A:h:h}"
cd "$root"
if [[ ! -d .git ]]; then
  echo 'Clone LectureMate from GitHub first. Auto-sync needs a Git checkout.'
  read 'reply?Press Return to exit...'; exit 1
fi
if [[ ! -f server/.env ]]; then
  cp server/.env.example server/.env
  echo 'Add your OpenAI API key to server/.env, then re-run this setup.'
  open -t server/.env
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 20+ from https://nodejs.org/ and re-run setup.'
  read 'reply?Press Return to exit...'; exit 1
fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/LectureMate"
uid=$(id -u)
node_path=$(command -v node)
# Escape strings in plist XML; shell paths may have & or special characters.
xml_escape() { python3 -c 'import html,sys;print(html.escape(sys.argv[1],quote=True))' "$1"; }
root_xml=$(xml_escape "$root")
node_xml=$(xml_escape "$node_path")
logdir_xml=$(xml_escape "$HOME/Library/Logs/LectureMate")
cat > "$HOME/Library/LaunchAgents/com.lecturemate.server.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>com.lecturemate.server</string>
 <key>ProgramArguments</key><array><string>${node_xml}</string><string>${root_xml}/server/server.js</string></array>
 <key>WorkingDirectory</key><string>${root_xml}</string>
 <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
 <key>StandardOutPath</key><string>${logdir_xml}/server.log</string>
 <key>StandardErrorPath</key><string>${logdir_xml}/server-error.log</string>
</dict></plist>
PLIST
cat > "$HOME/Library/LaunchAgents/com.lecturemate.sync.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>com.lecturemate.sync</string>
 <key>ProgramArguments</key><array><string>/bin/zsh</string><string>${root_xml}/scripts/sync-github.sh</string></array>
 <key>WorkingDirectory</key><string>${root_xml}</string>
 <key>StartInterval</key><integer>300</integer>
 <key>RunAtLoad</key><true/>
 <key>StandardOutPath</key><string>${logdir_xml}/sync.log</string>
 <key>StandardErrorPath</key><string>${logdir_xml}/sync-error.log</string>
</dict></plist>
PLIST
for label in com.lecturemate.server com.lecturemate.sync; do
  launchctl bootout "gui/${uid}/$label" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/${uid}" "$HOME/Library/LaunchAgents/$label.plist"
done
printf '\nLectureMate configured: background tutor server + 5-minute GitHub sync.\n'
printf 'You still approve the Safari/Tampermonkey extension and site permissions yourself.\n'
printf 'Security: changes pushed to this repo will automatically execute on your Mac.\n'
read 'reply?Press Return to close...'
