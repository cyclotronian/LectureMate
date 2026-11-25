# LectureMate — Chrome installation (free)

LectureMate is already a Chrome-compatible Manifest V3 extension. It does **not** need Tampermonkey, Safari, a Chrome Web Store listing, or a developer registration fee when loaded locally.

## One-time setup on macOS

1. Install **Google Chrome** and **Node.js 20+**.
2. Open Terminal and run:

   ```bash
   git clone https://github.com/cyclotronian/LectureMate.git
   cd LectureMate
   zsh scripts/chrome-setup.command
   ```

3. Chrome opens `chrome://extensions`. Enable **Developer mode**.
4. Click **Load unpacked** and choose `LectureMate/extension` (not the repo root).
5. Edit `server/.env`, replacing the placeholder with your **OpenAI API key**. Don't commit the `.env` file.
6. Run `zsh scripts/start-server.command`. Keep that Terminal session running.
7. Open or reload a YouTube video, then open the LectureMate tutor panel and try typing a question.

## Faster subsequent changes

- Changes pushed to GitHub can be pulled using `zsh scripts/update.command` or optionally the opt-in `zsh scripts/enable-auto-sync.command` helper (five-minute GitHub sync and login-time local server).
- **Chrome does not hot-reload unpacked extension JavaScript when its files change.** After a code update, click **Reload** on the LectureMate card at `chrome://extensions`, then refresh the YouTube tab. There is no need to uninstall or reselect the directory.
- A Chrome Web Store publication can provide managed browser auto-updates, but it requires publishing/review and a developer registration fee; it's not necessary for local development.
- The optional background sync will execute future code from the linked GitHub repository on your Mac. Enable it only if you trust the repository and this automation.

## Troubleshooting

- Missing tutor panel: make sure the extension is enabled for `https://www.youtube.com`, refresh the video tab, then click LectureMate in the toolbar.
- “Local tutor server is not running”: run `zsh scripts/start-server.command` and check `http://127.0.0.1:8787/health`.
- Safari-specific userscript instructions in the main README are optional and do not apply to Chrome.

**Security:** API keys belong exclusively in `server/.env`, not extension files, GitHub, or browser-visible JavaScript.
