// ==UserScript==
// @name         LectureMate - GitHub Live Loader
// @namespace    https://github.com/cyclotronian/LectureMate
// @version      1.0.0
// @description  Loads the latest LectureMate source from its GitHub repository whenever YouTube opens.
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      localhost
// @connect      127.0.0.1
// @connect      www.youtube.com
// @updateURL    https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.loader.user.js
// @downloadURL  https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.loader.user.js
// ==/UserScript==

/* Stable loader: only install once. All feature updates live in LectureMate.user.js.
   WARNING: loads and executes new code from the GitHub main branch on every YouTube load.
   Do not use with an untrusted repository, and do not enable the old LectureMate userscript.
*/
(function () {
  'use strict';
  const ROOT = 'https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/';
  const SOURCE = ROOT + 'LectureMate.user.js';
  const META = ROOT + 'LectureMate.meta.js';
  const TIMEOUT = 12000;
  const CHECK_EVERY_MS = 60000;
  let loadedVersion = '';

  function banner(message, isError, reloadable) {
    let node = document.getElementById('lm-loader-status');
    if (!node) {
      node = document.createElement('div');
      node.id = 'lm-loader-status';
      Object.assign(node.style, {position:'fixed',bottom:'18px',right:'18px',zIndex:'2147483647',maxWidth:'380px',background:'#263b67',color:'white',borderRadius:'10px',padding:'12px 16px',font:'13px -apple-system,sans-serif',boxShadow:'0 5px 24px #0005',cursor:reloadable?'pointer':'default'});
      (document.body || document.documentElement).appendChild(node);
    }
    node.textContent = message;
    node.style.background = isError ? '#8a2830' : '#263b67';
    if (reloadable) {
      node.style.cursor = 'pointer';
      node.title = 'Reload YouTube to install the new version';
      node.onclick = () => location.reload();
    } else {
      node.onclick = null;
      node.style.cursor = 'default';
    }
    return node;
  }
  function request(url) {
    return new Promise((resolve, reject) => {
      let complete = false;
      const timeout = setTimeout(() => finish(new Error('Timed out fetching GitHub source')), TIMEOUT);
      function finish(error, data) {
        if (complete) return;
        complete = true;
        clearTimeout(timeout);
        if (error) reject(error); else resolve(data);
      }
      try {
        GM_xmlhttpRequest({
          method:'GET',
          url:url + (url.includes('?')?'&':'?') + '_lm=' + Date.now(),
          timeout:TIMEOUT,
          onload(r) {
            if (r.status !== 200) return finish(new Error('GitHub returned HTTP ' + r.status));
            finish(null, String(r.responseText || ''));
          },
          onerror:() => finish(new Error('Tampermonkey could not reach raw.githubusercontent.com')),
          ontimeout:() => finish(new Error('GitHub request timed out')),
          onabort:() => finish(new Error('GitHub request was canceled'))
        });
      } catch (e) { finish(e); }
    });
  }
  function versionOf(source) {
    if (!source.startsWith('// ==UserScript==') ||
        !source.includes('// @namespace    https://github.com/cyclotronian/LectureMate')) {
      throw new Error('Downloaded content is not a LectureMate userscript');
    }
    const match = source.match(/^\/\/ @version\s+(\S+)\s*$/m);
    if (!match) throw new Error('Downloaded script has no version');
    return match[1];
  }
  async function load() {
    try {
      const code = await request(SOURCE);
      const version = versionOf(code);
      // This deliberately executes the current script fetched from the owner's GitHub.
      // A direct eval keeps Tampermonkey's GM_* functions available to LectureMate.
      eval(code);
      loadedVersion = version;
      console.info('[LectureMate loader] loaded GitHub version', version);
      if (!document.getElementById('lm-root')) {
        throw new Error('Script executed but the LectureMate panel was not created');
      }
    } catch (e) {
      console.error('[LectureMate loader]', e);
      banner('LectureMate: ' + (e?.message || e) + '. See Safari Console.', true, false);
    }
  }
  async function checkUpdate() {
    if (!loadedVersion) return;
    try {
      const latest = versionOf(await request(META));
      if (latest !== loadedVersion) {
        banner('LectureMate v' + latest + ' is ready. Click to reload this page.', false, true);
      }
    } catch (e) {
      console.warn('[LectureMate loader] update check failed', e);
    }
  }
  load();
  setInterval(checkUpdate, CHECK_EVERY_MS);
})();
