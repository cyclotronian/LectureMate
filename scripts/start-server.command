#!/bin/zsh
set -e
cd "${0:A:h:h}"
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 20+ is required: https://nodejs.org/'
  read 'reply?Press Return to exit...'
  exit 1
fi
if [[ ! -f server/.env ]]; then
  cp server/.env.example server/.env
  echo 'Edit server/.env to set OPENAI_API_KEY before starting.'
  open -t server/.env
  exit 1
fi
echo 'Starting LectureMate server (keep this terminal open).'
node --watch server/server.js
