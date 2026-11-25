# LectureMate 0.2.1 — listening and teacher-style whiteboard playback

This update adds three controls to the **native Safari Web Extension**:

1. **Hear any reply:** each AI answer has a **▶ Listen** button. Click it to play the explanation aloud, or **■ Stop** to interrupt it. This works for typed and voice questions and for answers already saved in this video's history. The existing speaker toggle still controls whether new replies play automatically.
2. **Reopen a hidden diagram:** click **▤ Show whiteboard** after hiding it, or click **▤ Whiteboard** beneath an answer to reopen *that answer's* complete diagram. The last diagram remains available even if a later answer contains no diagram.
3. **Teach while drawing:** for **new** responses, the AI can return 2–4 teaching stages. Each stage contains spoken narration and an incremental snapshot of the causal graph or equation. When you click Listen, the corresponding visual stage appears **as its narration begins**; when the narration finishes, the next stage appears. The full diagram is restored at the end or after Stop. Auto-read uses the same staged playback.

This is **progressive visual narration, not animated pen strokes**, and it uses Safari speech synthesis (not low-latency OpenAI Realtime voice). Older saved answers that lack teaching stages still read aloud and show their existing completed diagram.

## Running on Safari

1. In the LectureMate checkout, run `git pull --ff-only` (or use the existing local sync if enabled).
2. Make sure the Node AI server is running with your API key.
3. Because `extension/manifest.json` now includes `teacher-playback.js`, remove and re-add the temporary LectureMate extension using Safari → Settings → Developer → Add Temporary Extension, selecting the `LectureMate/extension` folder.
4. Leave both Tampermonkey LectureMate scripts disabled so they don't inject a second tutor.
5. Reload YouTube. Ask a new question such as: “Explain confounding step by step; draw the DAG as you teach.”
6. Click **▶ Listen** on the response. Watch the whiteboard progress through the narration. Hide the board, reopen it, and try Stop/replay.

## Notes

- Safari may require a user click before it allows audio; the per-reply Listen button is a direct gesture.
- Generated explanations sometimes do not need a diagram, in which case Listen still plays the voice without staged visuals.
- Voice playback relies on Safari's built-in speech voices; voice quality and timing vary by device and Safari version.
- If the text answer or whiteboard works but no sound plays, check Safari tab/site audio settings and macOS sound output, then use **▶ Listen** again.
- The changes have automated JS/unit tests but still need real-device validation in Safari.

The application continues to support playlist transcript context as documented in [PLAYLIST_SETUP.md](PLAYLIST_SETUP.md).
