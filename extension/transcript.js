/* Read only the transcript YouTube presents in its own watch-page UI.
 * No undocumented YouTube API calls, remote services or injected page JavaScript.
 */
(function (root) {
  'use strict';
  const ROWS = 'transcript-segment-view-model, ytd-transcript-segment-renderer';
  const TIMESTAMPS = '.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp, [class*="TranscriptSegmentViewModelTimestamp"]';
  const TEXT = 'span[role="text"], .segment-text, [class*="TranscriptSegmentViewModelText"]';
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function parseTime(value) {
    const s = clean(value);
    if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(s)) return null;
    const parts = s.split(':').map(Number);
    if (parts.slice(1).some(p => p > 59)) return null;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  function readRows(doc) {
    const result = [], seen = new Set();
    if (!doc?.querySelectorAll) return result;
    for (const row of doc.querySelectorAll(ROWS)) {
      const time = parseTime(row.querySelector?.(TIMESTAMPS)?.textContent);
      let content = row.querySelector?.(TEXT);
      // The older renderer uses a dedicated text element; newer renderers
      // may nest a role=text span beneath another view-model wrapper.
      const line = clean(content?.textContent);
      if (time === null || !line) continue;
      const key = time + '\0' + line;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({start:time, text:line});
    }
    return result.sort((a,b) => a.start - b.start);
  }
  function panel(doc) {
    if (!doc?.querySelector) return null;
    return doc.querySelector('ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"], ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"], ytd-engagement-panel-section-list-renderer[target-id*="transcript"], ytd-transcript-renderer');
  }
  function showButton(doc) {
    if (!doc?.querySelectorAll) return null;
    const exact = doc.querySelector('ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer [role="button"], ytd-transcript-section-renderer button');
    if (exact) return exact;
    for (const button of doc.querySelectorAll('button, [role="button"]')) {
      if (button.closest?.('#lm-root')) continue;
      const label = clean(button.getAttribute?.('aria-label') || button.textContent);
      if (/^(show|view|open) transcript$/i.test(label)) return button;
    }
    return null;
  }
  function expandDescription(doc) {
    return doc?.querySelector?.('ytd-watch-metadata #description-inline-expander #expand, ytd-watch-metadata ytd-text-inline-expander #expand, ytd-watch-metadata #description #expand') || null;
  }
  function closePanel(doc) {
    const p = panel(doc);
    if (!p) return false;
    const close = p.querySelector?.('ytd-engagement-panel-title-header-renderer #visibility-button button, button[aria-label="Close transcript"], button[aria-label="Close"]');
    if (!close) return false;
    close.click();return true;
  }
  const api = {readRows, parseTime, panel, showButton, expandDescription, closePanel};
  root.LectureMateTranscript = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : this);
