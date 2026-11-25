# LectureMate v0.2.0 — automatic playlist transcript context

LectureMate now recognizes a YouTube watch URL with a `list=...` parameter and stores transcripts **across the playlist**, not just the current video. A status label in the tutor shows exactly how many lessons have transcripts.

## One-time setup on macOS

1. Update the local repository: `git pull --ff-only` inside `LectureMate`. Your existing auto-sync can also pull it.
2. Install `yt-dlp` once to fetch *other* lessons without playing them:
   ```bash
   brew install yt-dlp
   yt-dlp --version
   ```
   If Homebrew isn't installed, see the [yt-dlp installation instructions](https://github.com/yt-dlp/yt-dlp/wiki/Installation) for other options. If needed, set `LECTUREMATE_YT_DLP=/absolute/path/to/yt-dlp` in `server/.env`. LectureMate searches the usual Homebrew locations automatically, including when launched by macOS launchd.
3. Keep the local Node server running. If you installed yt-dlp after starting the server, you can click **Retry full playlist indexing** in LectureMate Settings without reinstalling Node.
4. **Native Safari extension:** Because `extension/manifest.json` changed, remove and re-add your temporary extension from Safari → Settings → Developer → Add Temporary Extension; select the `LectureMate/extension` folder. Leave both Tampermonkey LectureMate scripts disabled.
5. Open a video from a normal YouTube playlist, such as
   `https://www.youtube.com/watch?v=DXBPtpBhGqo&list=PLoazKTcS0RzZ1SUgeOgc6SWt51gfT80N0`.
6. Watch the status in the tutor: `Playlist: 1/15 lessons with transcripts · fetching remaining lessons…` (numbers vary). The server indexes in the background; you can ask questions immediately.

## What it does

- The current video's transcript is captured through YouTube's own transcript UI (the existing v0.1.9 behavior).
- The extension reads visible playlist item IDs and titles.
- The local server can independently discover the first **40** lessons and fetch available **English** subtitle files using yt-dlp, without downloading video/audio media.
- Timestamped transcripts are cached under `~/Library/Application Support/LectureMate/playlists/` across server restarts.
- When asking a question, the tutor always gets the current video's nearby captions; it can also use ranked excerpts and lesson titles from the playlist cache, including future lessons.
- The model is not sent every word from every lesson in every request: it receives relevant selections to keep context manageable.
- If yt-dlp isn't installed, the tutor still builds the playlist cache incrementally as you watch lessons. The status explicitly says that yt-dlp is needed for the rest.

## Limitations and troubleshooting

- **Video slides/visuals are not yet interpreted.** This release addresses playlist-wide *spoken transcript* context only. Image/slide understanding requires a separate visual-capture feature.
- Some YouTube videos don't expose English subtitles or restrict automated extraction. Their lesson count remains *unindexed* rather than pretending the content was captured.
- Initial indexing can take time and is subject to YouTube access limits. The label updates as the work progresses.
- The feature currently caps automated discovery at the first 40 lessons. This is an explicit resource limit, not a promise of full indexing for larger playlists.
- Click **Settings → Retry full playlist indexing** if you install yt-dlp or want to retry failed lessons. No restart is needed for retrying, provided yt-dlp is on a discoverable path.
- Check `~/Library/Logs/LectureMate/server-error.log` if using background auto-sync and indexing stops unexpectedly.

**Security:** Only validated YouTube playlist/video identifiers are accepted. The local Node process invokes yt-dlp without a shell, builds YouTube URLs itself, and keeps API keys in `server/.env`. Index files stay on your Mac.
