#!/bin/zsh
# Development-only automatic updater: runs every 5 minutes if explicitly enabled.
# Security: updates this Git checkout and restarts the local Node server.
set -eu
cd "${0:A:h:h}"
[[ -d .git ]] || exit 0
# Never discard/overwrite local tracked edits; skip until user resolves the conflict.
git diff --quiet && git diff --cached --quiet || exit 0
old=$(git rev-parse HEAD)
# Do not hang launchd requesting an interactive password or GitHub credentials.
GIT_TERMINAL_PROMPT=0 git pull --ff-only --quiet || exit 0
new=$(git rev-parse HEAD)
if [[ "$old" != "$new" ]]; then
  if command -v node >/dev/null 2>&1; then node --test tests/server.test.js || exit 1; fi
  launchctl kickstart -k "gui/$(id -u)/com.lecturemate.server" >/dev/null 2>&1 || true
fi
