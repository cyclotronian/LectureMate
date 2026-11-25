# LectureMate — Safari AI tutor MVP

> **Transcript fix (v0.1.9, Nov 2026):** LectureMate now reads YouTube's built-in transcript panel first, including the modern `transcript-segment-view-model` rows as well as legacy `ytd-transcript-segment-renderer` rows. It opens YouTube's `Show transcript` button when available and saves timestamped segments for questions. Direct `timedtext` remains a fallback. If the status says transcript unavailable, open `Show transcript` manually on YouTube, then click `Settings → Retry captions`. This is best effort and not yet verified on Safari in the user's session. See [open-source evidence](https://github.com/colluvio/transcopy) and [2026 DOM observations](https://dev.to/alapha888/youtubes-transcript-panel-changed-its-dom-the-new-selectors-that-actually-work-4a2n).


> **Safari networking update (v0.1.6, Nov 2026):** YouTube-page requests to the local Node server are blocked by Safari on the tested setup, and Tampermonkey GM requests timed out. The recommended test is now the [native Safari Web Extension](SAFARI_NATIVE_TEST.md), which uses a Safari event-page background and explicit loopback host permissions. Disable the Tampermonkey LectureMate script before testing to avoid duplicate panels. This path has passed source/CI checks but still needs verification in Safari on the Mac; it isn't a confirmed connection fix yet.

**Working source-code MVP** for a same-window YouTube tutor with **typed + voice questions**, spoken responses, conversational history, captions when available, user-added whole-course context, and a structured whiteboard (causal DAGs and equations).

## Fast-iteration setup (recommended): Safari + Tampermonkey + GitHub

This is a second, **optional** way to install the same tutor on Safari. Instead of manually packaging/reloading a native Safari extension on every change, a Safari userscript manager maintains the YouTube UI and checks a GitHub-hosted script for updates.

**Published GitHub source:** The public repository is [cyclotronian/LectureMate](https://github.com/cyclotronian/LectureMate). The auto-update URL is `https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.user.js`. Your OpenAI API key stays on your Mac in `server/.env`; it is not committed to GitHub.

One-time steps:

1. Install the official [Tampermonkey Safari extension](https://www.tampermonkey.net/) through the Mac App Store, and enable it for YouTube in Safari.
2. Open the [LectureMate userscript URL](https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.user.js) in Safari and install it using Tampermonkey's script manager. Grant only the displayed YouTube and localhost permissions you are comfortable with.
3. On the Mac, clone `https://github.com/cyclotronian/LectureMate.git`, edit `server/.env` with `OPENAI_API_KEY=...`, then double-click `scripts/enable-auto-sync.command` to opt into a login-time server and five-minute automatic GitHub sync. Or run `scripts/start-server.command` without background syncing.
4. Open a YouTube watch page. Type or speak a question in the LectureMate side panel. When the script manager picks up a new published version number, reload the YouTube tab to use it.

**Future changes:** Code changes can be pushed to GitHub. The userscript has `@updateURL`/`@downloadURL`; Tampermonkey can check for and automatically install updates depending on its configuration, while `sync-github.sh` optionally updates your local backend every five minutes. Neither flow remotely controls your Safari browser. There can be a delay before updates become active. **Do not install both the native extension and the userscript simultaneously**, or two copies of the panel may appear.

**Security:** Auto-sync runs newly pushed code on your Mac under your user account; enable it only for a trusted repository. `scripts/disable-auto-sync.command` stops the server/automatic GitHub sync. The code should be reviewed before enabling automatic updates. Userscript behavior in Safari and speech-permission support have not been tested on your specific Mac.

### Publishing the userscript from GitHub

When the repo is available, `node scripts/build-userscript.js` assembles `extension/content.js` and `extension/content.css` into a self-contained `dist/LectureMate.user.js`. Bump `extension/manifest.json`'s `version` when publishing user-visible changes so the script manager recognizes them as updates. Keep `dist/LectureMate.user.js` committed; GitHub Actions checks that it matches source. For another GitHub host/path, set `LECTUREMATE_USERSCRIPT_URL` before building and update the `@namespace` in the build script as appropriate.


## 1. Requirements

- macOS Safari with **Safari Web Extensions** support (recent Safari recommended).
- Node.js 20+ on your Mac.
- Your own OpenAI API key with API billing enabled (this is **not** your ChatGPT Plus subscription).

## 2. Start the local AI server

In Terminal:

```bash
cd /path/to/LectureMate/server
cp .env.example .env
# Edit .env and replace sk-your-key-here with your OpenAI API key.
node server.js
```

Leave Terminal open while using the tutor. Visit http://127.0.0.1:8787/health — it should show `"configured":true`.

**Security:** The key is only read by the local Node process. It is not placed in Safari or sent to YouTube. The server listens exclusively on `127.0.0.1` and accepts browser requests only from browser-extension origins. Keep `.env` private.

## 3. Install as a temporary Safari extension

Apple's [current official method](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension):

1. Safari → **Settings → Advanced** → enable **Show features for web developers** (if needed).
2. Safari → **Settings → Developer** → enable **Allow unsigned extensions**.
3. Safari → **Settings → Developer → Add Temporary Extension…** → choose the **extension** folder inside LectureMate (not the server folder). Safari can also accept its ZIP.
4. In the Safari Extensions panel, enable **LectureMate** and allow it to access `youtube.com` and your local server if prompted.
5. Open a normal YouTube video watch page. You should see the tutor panel on the right. Drag its left edge to resize. The extension toolbar button or the in-page floating Tutor button toggles it.

Temporary Safari extensions are removed when Safari quits or after 24 hours. This is expected.

For a permanent development installation, use Xcode and Apple's [Safari Web Extension Packager](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari):

```bash
xcrun safari-web-extension-packager /path/to/LectureMate/extension --app-name LectureMate --macos-only
```

The command `safari-web-extension-converter` is the old name. Build and run the generated macOS app using Xcode.

## 4. Try it

1. Play any educational YouTube video.
2. Pause, **type a question**, and press **Enter**; or press **🎙** and speak (first use may need microphone permission).
3. Answers appear in the same chat. The tutor can respond aloud: use **♬** to enable spoken replies. Voice-asked questions automatically receive spoken replies.
4. Ask: **"Draw a causal DAG showing confounding between treatment and outcome."** The tutor should add a graph to its whiteboard when the AI server is running.
5. Open **Course material** to paste transcripts, syllabus, readings, and later-lecture material, or add `.txt`, `.md`, `.srt`, `.vtt` files. This persists locally and enriches future answers.

If Safari speech recognition is unavailable, type instead or use macOS system Dictation in the input box. Safari may require microphone permission. This MVP uses the OS/browser speech APIs, not OpenAI's streaming real-time voice API.

## What this MVP does (and doesn't)

| Capability | MVP |
| --- | --- |
| Same-window, adjustable panel | Yes |
| Text and voice questions in one shared chat | Yes |
| Spoken replies (tap-to-talk) | Yes, via Web Speech APIs |
| Auto-identify current video + timestamp | Yes |
| Fetch whole-current-video captions | Best effort; YouTube may block timedtext endpoints |
| Access future course materials | Yes, when supplied in Course material |
| Automatically ingest an entire playlist | **No** (future iteration) |
| See video frames/slide images | **No** (future iteration) |
| Diagrams/equations | Structured DAG / formatted basic mathematical notation (not complete LaTeX typesetting) |
| Continuous low-latency duplex voice | **No** (future iteration) |

### Important implementation notes

- Captions: the extension attempts to read the current YouTube player metadata and caption tracks. YouTube often changes these mechanisms. If automatic extraction fails, the panel indicates that, and you can provide transcript text in the **Course material** tab. Title and timestamp remain available even without captions.
- Course retrieval: large pasted material is scored against the question to fit a model context limit. There is no embeddings database yet.
- Conversation history is saved by YouTube video ID using browser extension local storage.
- Equations are displayed using a lightweight symbol formatter; complete typesetting (KaTeX/MathJax) is planned for a subsequent iteration.
- Text/voice both feed one backend, so there is no duplicate agent state.
- Do not distribute the extension with private data or API keys; keep `.env` out of any repository.

## Project structure

```
LectureMate/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   └── content.css
├── server/
│   ├── server.js
│   ├── .env.example
│   └── start.command
├── dist/
│   └── LectureMate.user.js     # Safari userscript (auto-update metadata)
├── scripts/
│   ├── build-userscript.js
│   ├── start-server.command
│   ├── update.command
│   ├── enable-auto-sync.command
│   ├── sync-github.sh
│   └── disable-auto-sync.command
├── .github/workflows/tests.yml
└── tests/
    └── server.test.js
```

**License:** MIT (see LICENSE).
