# LectureMate — Native Safari Connection Test (v0.1.6)

The YouTube page's ordinary `fetch('http://127.0.0.1:8787/health')` was blocked by Safari access controls, while `curl` and navigating directly to the server worked. Tampermonkey's `GM_xmlhttpRequest` also timed out. This test changes the request source: a Safari **Web Extension background event page** requests the local server on behalf of a YouTube content script, using declared host permissions.

**Important:** This is an architecture fix candidate, not yet validated on your Mac.

## One-time test (no Xcode required)

1. Make sure the local server works: `curl http://127.0.0.1:8787/health` should return `ok: true` and `configured: true`.
2. Disable both Tampermonkey LectureMate scripts (regular and experimental Live Loader). Tampermonkey itself may remain installed.
3. Open Terminal in your existing local `LectureMate` repo; run `git pull --ff-only`. If your optional auto-sync already updated the checkout, this may report “Already up to date.”
4. In Safari, turn on **Safari → Settings → Advanced → Show features for web developers** (if it isn't enabled).
5. Go to **Safari → Settings → Developer → Add Temporary Extension…** and select the **`extension` folder** inside your cloned `LectureMate` checkout, not the repo root.
6. If prompted, approve the unsigned-development-extension confirmation. In **Safari → Settings → Extensions**, enable LectureMate and allow it to access `youtube.com` and **`127.0.0.1`**.
7. Reload YouTube, open the LectureMate panel, and click **Settings → Check connection**. A working request should display **Connected ✓**, with the configured model.

## If connection is still offline

- Copy the exact connection error in the LectureMate panel; it now includes the background fetch error, rather than always saying “server not running.”
- To inspect extension networking, Safari → **Develop → Web Extension Background Content → LectureMate** and look for errors. Safari may require the extension to be running.
- If Safari reports a host permission error, check the site's grant for `127.0.0.1` in Safari's **LectureMate extension** permissions (not Tampermonkey permissions).
- If Safari reports CORS or access-control checks in the extension's background context, share that error. Do not weaken the server to accept arbitrary YouTube-page POST requests.

## Supported update path

For this **temporary** Safari Web Extension, GitHub changes can be synced into the local checkout, but Safari still needs to reload the extension for changed JavaScript. This is not the same as Safari automatically executing a GitHub push.

Apple removes temporary extensions when Safari quits or after approximately 24 hours. For a persistent development installation, package and sign the extension with Xcode using Apple's Safari Web Extension Packager. See Apple's [Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) guidance.

## Implementation details

- `extension/manifest.json` declares both MV3 background environments. Safari selects a nonpersistent `background.scripts` event page; Chrome selects the service worker. This avoids some Safari-specific MV3 service-worker networking issues.
- The YouTube content script sends a `HEALTH` or `CHAT` message to the extension background.
- The background requests `http://127.0.0.1:8787` using its host permission; the local Node server accepts WebExtension-origin requests while rejecting ordinary YouTube page requests to the paid API.
- The OpenAI key stays in `server/.env`.

References: [Apple developer documentation](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension), [MDN: background contexts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).
