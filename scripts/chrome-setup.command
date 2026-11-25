#!/bin/zsh
# LectureMate Chrome first-run helper. Run from a cloned GitHub checkout.
set -eu
root="${0:A:h:h}"
cd "$root"

if [[ ! -f extension/manifest.json ]]; then
  echo "LectureMate extension manifest missing."
  exit 1
fi
if [[ ! -f server/.env ]]; then
  cp server/.env.example server/.env
  echo "Created server/.env. Add your OPENAI_API_KEY before using LectureMate."
  open -t server/.env
fi

echo ""
echo "Chrome setup:"
echo "  1. Turn on Developer Mode at chrome://extensions."
echo "  2. Choose Load unpacked."
echo "  3. Select this extension directory:"
echo "     $root/extension"
echo "  4. Grant access to youtube.com when prompted."
echo ""
open -a "Google Chrome" "chrome://extensions" || true
open "$root/extension"

if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 20+ from https://nodejs.org/ before running the AI backend."
  exit 0
fi

echo "Start the AI server in a separate terminal with:"
echo "  cd '$root' && zsh scripts/start-server.command"
echo ""
echo "For optional GitHub auto-sync and background server:"
echo "  zsh scripts/enable-auto-sync.command"
echo ""
echo "Note: GitHub auto-sync updates files on disk; Chrome must still reload"
echo "the unpacked extension from chrome://extensions (and refresh YouTube)."
