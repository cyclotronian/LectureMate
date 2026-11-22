#!/bin/zsh
set -eu
uid=$(id -u)
for label in com.lecturemate.sync com.lecturemate.server; do
  launchctl bootout "gui/${uid}/$label" >/dev/null 2>&1 || true
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
printf '\nAutomatic updates and the background server have been disabled. Files and API key remain untouched.\n'
read 'reply?Press Return to close...'
