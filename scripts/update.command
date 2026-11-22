#!/bin/zsh
# One-click update after cloning the GitHub repo. Does not touch local .env files.
set -e
cd "${0:A:h:h}"
if [[ ! -d .git ]]; then
  echo 'This copy is not a git checkout. Clone the LectureMate repository once, then run this updater.'
  read 'reply?Press Return to exit...'
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Local tracked edits detected; not overwriting your work.'
  read 'reply?Press Return to exit...'
  exit 1
fi
git pull --ff-only
node --test tests/server.test.js
printf '\nUpdated. Restart the local server if needed, then refresh YouTube.\n'
printf 'Native Safari development extensions may also need Safari > Settings > Developer > Reload.\n'
read 'reply?Press Return to close...'
