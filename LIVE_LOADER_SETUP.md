> **NOT SUPPORTED IN SAFARI / YOUTUBE (2026-11-25).** The live loader can download GitHub JavaScript but Safari/YouTube's Trusted Types/CSP prevents evaluating it. Do not install or use this experimental loader; disable it. Use the regular LectureMate userscript for now, or package the application as a native Safari Web Extension for supported distribution and managed updates. This file is retained only as an experimental record.

# LectureMate GitHub Live Loader (Safari development)

The **Live Loader** is a stable Tampermonkey userscript that fetches the current `main/dist/LectureMate.user.js` from GitHub every time a YouTube page loads. It does not rely on Tampermonkey's 6-hour update interval.

## One-time migration

1. Open Tampermonkey's **Installed Userscripts** tab.
2. **Disable** the old `LectureMate - AI Video Tutor` userscript (do not delete it until the new loader works).
3. In Tampermonkey **Utilities → Import from URL**, paste:
   `https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.loader.user.js`
4. Install `LectureMate - GitHub Live Loader` and grant access to `raw.githubusercontent.com`, `www.youtube.com`, and the local AI server as required.
5. Refresh a YouTube watch page. The loader should fetch the latest application script and create the familiar tutor panel.
6. In Safari Developer Console, check for `[LectureMate loader] loaded GitHub version`. If the loader cannot fetch or execute the source, it displays a red error banner on the YouTube page.

**Do not enable the old LectureMate script and the live loader together**: both try to install the tutor panel.

## Routine updates

- On every YouTube page load, the loader fetches the **current GitHub main branch** source with a cache-busting query string.
- Every minute while YouTube stays open, it checks `LectureMate.meta.js`; if the version differs, it displays a clickable **Reload to update** notice. It does not interrupt an ongoing lecture.
- Changes pushed to GitHub must update `dist/LectureMate.user.js` **and** increase the version in `LectureMate.meta.js` to trigger the on-page notice. The existing build script handles those outputs.
- GitHub pushes cannot directly make Safari execute new extension code. This is a browser-initiated pull approach, not push notification.
- The separate local Node.js backend still uses the existing optional five-minute GitHub sync. The loader only changes how frontend code is updated.

## Security and compatibility

The loader downloads **and evaluates executable JavaScript** from the public GitHub repository's `main` branch. Anyone allowed to push to that branch controls code that will run in the browser on subsequent YouTube page loads. Only use this workflow for a repository you control and trust. For production use, prefer pinned, reviewed, signed releases.

**Compatibility caveat:** Some Safari/Tampermonkey configurations may block dynamically evaluating a downloaded script, even if the Tampermonkey network request succeeds. This mechanism has not yet been verified on your Safari installation. If it fails, check the red banner and Console; do not repeatedly reinstall it. A native Safari Web Extension is the more reliable long-term alternative.
