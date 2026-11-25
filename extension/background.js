/* LectureMate: keep network operations in the extension service worker. */
const platform = globalThis.browser || globalThis.chrome;

platform.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.type !== 'string') return false;
  (async () => {
    const pageUrl=sender?.url || sender?.tab?.url || sender?.origin || '';
    if (!pageUrl.startsWith('https://www.youtube.com/'))
      return {ok:false,transport:'Safari Web Extension',error:'Rejected message: sender is not a recognized YouTube page (sender URL '+(pageUrl?'present':'missing')+').'};
    if (request.type === 'CHAT') return await chat(request.payload);
    if (request.type === 'CAPTIONS') return await getCaptions(request.url);
    if (request.type === 'HEALTH') return await health();
    return { ok: false, error: 'Unknown request' };
  })().then(sendResponse).catch(err => sendResponse({ok:false, error:String(err?.message || err)}));
  return true;
});

try {
  platform.action.onClicked.addListener(async tab => {
    if (!tab?.id) return;
    try { await platform.tabs.sendMessage(tab.id, {type:'TOGGLE_PANEL'}); } catch (_) {}
  });
} catch (_) { /* Safari versions without toolbar click support retain in-page toggle. */ }

async function health() {
  // Safari requires an explicit website grant even for declared host permissions.
  // A permission check is more actionable than a generic "Load failed".
  try {
    if (platform.permissions?.contains) {
      const hasAccess = await platform.permissions.contains({origins:['http://127.0.0.1/*']});
      if (hasAccess === false) {
        return {ok:false,transport:'Safari Web Extension',
          error:'Safari has not granted LectureMate access to 127.0.0.1. Open Safari Settings → Extensions → LectureMate → Edit Websites and allow 127.0.0.1.'};
      }
    }
  } catch (e) {
    console.warn('[LectureMate] Could not inspect host permission:',e?.message||e);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch('http://127.0.0.1:8787/health', {signal:controller.signal,cache:'no-store'});
    if (!r.ok) throw new Error(`Local server returned ${r.status}`);
    return {ok:true, ...await r.json(),transport:'Safari Web Extension'};
  } catch(e) {
    const reason=e?.name==='AbortError'?'Timed out after 4 seconds':String(e?.message||e);
    return {ok:false,transport:'Safari Web Extension',error:'Background fetch to 127.0.0.1:8787 failed: '+reason+'. Confirm the LectureMate (not Tampermonkey) extension has host access to 127.0.0.1.'};
  }
  finally { clearTimeout(timer); }
}

async function chat(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const r = await fetch('http://127.0.0.1:8787/api/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload), signal:controller.signal
    });
    let data;
    try { data = await r.json(); } catch (_) { throw new Error(`Server returned HTTP ${r.status}`); }
    if (!r.ok || !data.ok) return {ok:false,error:data.error || `HTTP ${r.status}`};
    return data;
  } catch (e) { return {ok:false,error:String(e?.message || e)}; }
  finally { clearTimeout(timer); }
}

async function getCaptions(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.pathname !== '/api/timedtext')
      throw Error('Untrusted caption URL');
  } catch (_) { return {ok:false,error:'Caption track URL was unavailable or invalid.'}; }
  url.searchParams.set('fmt','json3');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.href, {signal:controller.signal,credentials:'include'});
    if (!response.ok) throw Error(`YouTube captions returned HTTP ${response.status}`);
    const raw = await response.text();
    if (!raw.trim()) throw Error('YouTube returned an empty caption track');
    const data = JSON.parse(raw);
    const entries = (data.events || []).filter(e => Array.isArray(e.segs))
      .map(e => ({start:Math.max(0,(e.tStartMs || 0)/1000), text:e.segs.map(s=>s.utf8||'').join('').replace(/\s+/g,' ').trim()}))
      .filter(e=>e.text && e.text !== '\n');
    if (!entries.length) throw Error('Caption track has no spoken text');
    return {ok:true,segments:entries.slice(0,20000)};
  } catch (e) { return {ok:false,error:String(e?.message || e)}; }
  finally { clearTimeout(timer); }
}
