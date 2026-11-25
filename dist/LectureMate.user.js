// ==UserScript==
// @name         LectureMate - AI Video Tutor
// @namespace    https://github.com/cyclotronian/LectureMate
// @version      0.2.1
// @description  Ask contextual questions by typing or voice beside YouTube; get visual explanations.
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @connect      www.youtube.com
// @updateURL    https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.meta.js
// @downloadURL  https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.user.js
// ==/UserScript==
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

/* Playlist companion for LectureMate's native Safari extension.
 * Keeps the tutor's existing video transcript logic untouched.
 */
(function(root){
  'use strict';
  const P={S:null,send:null,r:null,lastKey:'',playlistId:'',syncBusy:false,status:null,lastAttempt:0,lastStatus:0};
  const valid=id=>/^[A-Za-z0-9_-]{10,64}$/.test(id||'');
  const playlistId=()=>{
    const id=new URL(location.href).searchParams.get('list')||'';
    return valid(id)?id:'';
  };
  function collectVisibleItems(doc=document){
    const items=[],seen=new Set();
    for(const row of doc.querySelectorAll('ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer')){
      const anchor=row.querySelector('a[href*="watch?"]');
      if(!anchor)continue;
      let id='';
      try{id=new URL(anchor.href,location.href).searchParams.get('v')||'';}catch(_){}
      if(!/^[A-Za-z0-9_-]{11}$/.test(id)||seen.has(id))continue;
      seen.add(id);
      const title=row.querySelector('#video-title, .title, yt-formatted-string')?.textContent?.trim()||anchor.title||'';
      items.push({id,title:title.slice(0,180)});
      if(items.length>=40)break;
    }
    return items;
  }
  function render(data){
    if(!P.status)return;
    P.status.hidden=!P.playlistId;
    if(!P.playlistId)return;
    if(!data?.ok){P.status.textContent='Playlist: index status unavailable';return;}
    let text='Playlist: '+data.indexed+'/'+data.total+' lessons with transcripts';
    if(data.state==='indexing')text+=' · fetching remaining lessons…';
    if(data.ytDlpRequired)text+=' · install yt-dlp to fetch the rest';
    if(data.truncated)text+=' · limited to first 40 lessons';
    if(data.error && !data.ytDlpRequired)text+=' · '+data.error.slice(0,90);
    P.status.textContent=text;
    P.status.title=data.error||text;
  }
  async function sync(force=false){
    if(P.syncBusy||!P.playlistId||!P.S?.videoId)return;
    const id=P.playlistId;
    P.syncBusy=true;
    try{
      const out=await P.send({type:'PLAYLIST_SYNC',payload:{
        playlistId:id,
        current:{id:P.S.videoId,title:P.S.videoTitle,transcript:P.S.transcript},
        videos:collectVisibleItems()
      }});
      if(P.playlistId===id)render(out);
    }catch(e){console.warn('[LectureMate playlist] Sync failed:',e?.message||e)}
    finally{P.syncBusy=false;}
  }
  async function status(){
    if(!P.playlistId)return;
    const id=P.playlistId;
    try{
      const out=await P.send({type:'PLAYLIST_STATUS',playlistId:id});
      if(P.playlistId===id)render(out);
    }catch(e){console.warn('[LectureMate playlist] Status unavailable:',e?.message||e);}
  }
  function tick(){
    if(!P.S||!P.status)return;
    const id=playlistId();
    if(id!==P.playlistId){
      P.playlistId=id;P.lastKey='';P.lastAttempt=0;
      P.status.hidden=!id;
      if(id)P.status.textContent='Playlist: discovering lessons…';
    }
    if(!id||!P.S.videoId)return;
    // The current lecture is ingested automatically whenever its transcript
    // appears or the playlist item list is updated.
    const items=collectVisibleItems();
    const key=id+'|'+P.S.videoId+'|'+(P.S.transcript?.length||0)+'|'+items.map(x=>x.id).join(',');
    if(key!==P.lastKey && Date.now()-P.lastAttempt>=2000){
      P.lastKey=key;P.lastAttempt=Date.now();sync();
    }
    if(Date.now()-P.lastStatus>14000){P.lastStatus=Date.now();status();}
  }
  function init({S,sendMessage,r}){
    if(P.S)return;
    P.S=S;P.send=sendMessage;P.r=r;
    const el=document.createElement('div');
    el.id='lm-playlist-status';
    el.style.cssText='font-size:11px;color:#476a97;background:#f0f5ff;padding:6px 8px;margin-top:6px;border-radius:6px;line-height:1.3;';
    el.hidden=true;
    r('lm-title')?.parentElement?.appendChild(el);
    P.status=el;
    const button=document.createElement('button');
    button.type='button';button.textContent='Retry full playlist indexing';
    button.addEventListener('click',async()=>{
      if(!P.playlistId)return;
      button.disabled=true;
      try{
        await sync(true);
        const response=await P.send({type:'PLAYLIST_RETRY',payload:{playlistId:P.playlistId}});
        render(response);
      }catch(e){P.status.textContent='Playlist retry failed: '+(e.message||e);}
      finally{button.disabled=false;}
    });
    r('lm-about-view')?.appendChild(button);
    window.addEventListener('yt-navigate-finish',()=>setTimeout(tick,600));
    setInterval(tick,3000);
    tick();
  }
  root.LectureMatePlaylist={init,currentId:playlistId,collectVisibleItems};
  if(typeof module==='object'&&module.exports)module.exports={valid,collectVisibleItems};
})(typeof globalThis==='object'?globalThis:this);

/* LectureMate voice + whiteboard storyboard.
 * The text of each short spoken stage is paired with a complete visual frame.
 * Frames are revealed when their narration begins; no guesswork based on
 * approximate word timings. This is progressive teaching, not handwriting.
 */
(function(root){
  'use strict';
  const isVisual=v=>!!v && (v.type==='dag'||v.type==='equation');
  function stagesFor(message){
    const prepared=Array.isArray(message?.teachingSteps)
      ?message.teachingSteps.slice(0,5).filter(x=>x && typeof x.spoken==='string' && x.spoken.trim())
      :[];
    if(prepared.length){
      const finalVisual=isVisual(message.visual)?message.visual:null;
      return prepared.map((x,index)=>({
        spoken:x.spoken.trim().slice(0,1100),
        visual:isVisual(x.visual)?x.visual:(index===prepared.length-1?finalVisual:null)
      }));
    }
    const spoken=String(message?.spoken||message?.text||'').trim().slice(0,4000);
    return spoken?[{spoken,visual:isVisual(message?.visual)?message.visual:null}]:[];
  }
  function createPlayer({onFrame=()=>{},onChange=()=>{},onError=()=>{},synth,Utterance}={}){
    const getSynth=()=>synth||root.speechSynthesis;
    const getUtterance=()=>Utterance||root.SpeechSynthesisUtterance;
    let generation=0,active=null;
    function isPlaying(message){return active===message;}
    function stop({restore=true}={}){
      generation++;
      const prior=active;active=null;
      try{getSynth()?.cancel();}catch(_){}
      if(prior){
        if(restore && isVisual(prior.visual))onFrame(prior.visual,0,0,true);
        onChange(prior,false,0,0);
      }
    }
    function play(message){
      const engine=getSynth(),Speech=getUtterance();
      if(!engine||!Speech){
        onError('Spoken replies are unavailable in this Safari version.');return false;
      }
      const stages=stagesFor(message);
      if(!stages.length)return false;
      stop({restore:false});
      const session=++generation;
      active=message;onChange(message,true,0,stages.length);
      const voices=typeof engine.getVoices==='function'?engine.getVoices():[];
      const voice=voices.find(v=>String(v.lang||'').toLowerCase().startsWith('en-'));
      function advance(index){
        if(generation!==session||active!==message)return;
        if(index>=stages.length){
          if(isVisual(message.visual))onFrame(message.visual,stages.length,stages.length,true);
          active=null;onChange(message,false,stages.length,stages.length);
          return;
        }
        const stage=stages[index];
        if(stage.visual)onFrame(stage.visual,index+1,stages.length,false);
        onChange(message,true,index+1,stages.length);
        const utterance=new Speech(stage.spoken);
        utterance.rate=0.98;utterance.pitch=1;
        if(voice)utterance.voice=voice;
        utterance.onend=()=>advance(index+1);
        utterance.onerror=event=>{
          if(generation!==session)return;
          active=null;
          if(isVisual(message.visual))onFrame(message.visual,stages.length,stages.length,true);
          onChange(message,false,index+1,stages.length);
          if(!['canceled','interrupted'].includes(event?.error))onError('Speech playback failed: '+(event?.error||'unknown error'));
        };
        try{engine.speak(utterance)}catch(e){
          if(generation!==session)return;
          active=null;onChange(message,false,index+1,stages.length);
          onError('Could not play audio: '+e.message);
        }
      }
      advance(0);
      return true;
    }
    return {play,stop,isPlaying};
  }
  const api={stagesFor,createPlayer,isVisual};
  root.LectureMateTeacher=api;
  if(typeof module==='object' && module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);

(() => {
'use strict';
if (window.__lectureMateLoaded) return;
window.__lectureMateLoaded = true;
const ext = {runtime:{onMessage:{addListener:()=>{}}}};
const style=document.createElement("style");style.textContent="/* LectureMate: styles prefixed to avoid modifying YouTube controls. */\n:root { --lm-width: 460px; }\nhtml.lm-active #page-manager { margin-right:var(--lm-width) !important; }\nhtml.lm-active ytd-watch-flexy[theater] #full-bleed-container { max-width: calc(100vw - var(--lm-width)) !important; }\n#lm-root { all:initial; font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif; color:#26354a; font-size:14px; }\n#lm-root *, #lm-root *::before, #lm-root *::after {box-sizing:border-box;}\n#lm-root button, #lm-root textarea {font:inherit;}\n#lm-root button {cursor:pointer;}\n#lm-root [hidden] {display:none !important;}\n#lm-root #lm-shell {\n  position:fixed;z-index:2147483645;right:0;top:0;height:100vh;height:100dvh;width:var(--lm-width);\n  background:#f9fbff;border-left:1px solid #dce5f1;box-shadow:-14px 0 30px rgba(23,38,62,.10);\n  display:flex;flex-direction:column;overflow:hidden;\n}\n#lm-root #lm-launcher {\n  position:fixed;right:16px;bottom:32px;z-index:2147483645;cursor:pointer;\n  background:#283a68;color:white;border-radius:32px;padding:11px 17px;box-shadow:0 5px 26px rgba(25,47,77,.3);font-weight:700;user-select:none;\n}\n#lm-root #lm-launcher span {color:#9fe3ff;padding-right:6px;}\n#lm-root #lm-resize {position:absolute;left:0;top:0;width:9px;height:100%;cursor:ew-resize;z-index:5;}\n#lm-root #lm-resize:hover {background:rgba(80,129,220,.18);}\n#lm-root #lm-header {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 20px 13px 23px;background:white;border-bottom:1px solid #e6ebf4;flex-shrink:0;}\n#lm-root .lm-brand {display:flex;align-items:center;gap:11px;}\n#lm-root .lm-brand strong {display:block;font-size:18px;letter-spacing:-.5px;line-height:1.2;color:#25365c;}\n#lm-root .lm-brand small {display:block;font-size:11px;letter-spacing:.08px;color:#8695a8;margin-top:3px;}\n#lm-root .lm-brand-icon {width:36px;height:36px;background:#273d77;color:#ddf8ff;border-radius:12px;display:grid;place-items:center;font-size:21px;}\n#lm-root .lm-header-actions {display:flex;align-items:center;gap:4px;}\n#lm-root .lm-header-actions button {border:0;background:transparent;color:#77879d;border-radius:7px;font-size:15px;padding:5px 8px;}\n#lm-root .lm-header-actions button:hover {background:#edf2fa;}\n#lm-root #lm-mini {font-size:12px;}\n#lm-root .lm-success {color:#34876c !important;}\n#lm-root .lm-warning {color:#c07e2c !important;}\n#lm-root .lm-video-info {background:white;border-bottom:1px solid #e6ebf4;padding:11px 19px 12px 23px;flex-shrink:0;}\n#lm-root #lm-title {font-size:12px;color:#465773;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-weight:600;}\n#lm-root .lm-status-row {display:flex;align-items:center;gap:9px;margin-top:7px;color:#7e8fa5;font-size:11px;}\n#lm-root #lm-timestamp {background:#eaf0f9;color:#576d88;border-radius:5px;padding:3px 6px;white-space:nowrap;}\n#lm-root #lm-context {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;}\n#lm-root #lm-tabs {display:flex;padding:5px 14px 0;background:white;border-bottom:1px solid #e8edf4;gap:4px;flex-shrink:0;}\n#lm-root #lm-tabs button {color:#7f8ca0;background:transparent;padding:11px 10px 12px;border:0;border-bottom:2px solid transparent;font-size:12px;font-weight:650;}\n#lm-root #lm-tabs button.lm-selected {color:#3559a0;border-color:#537fcf;}\n#lm-root .lm-view {min-height:0;flex:1;overflow:auto;}\n#lm-root #lm-chat-view {display:flex;flex-direction:column;overflow:hidden;}\n#lm-root #lm-messages {padding:19px 17px 13px 21px;min-height:0;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:19px;}\n#lm-root .lm-welcome {margin:auto 0;text-align:center;color:#5f6c7f;padding:10px 20px 24px;}\n#lm-root .lm-welcome-icon {color:#5f7db4;font-size:35px;margin-bottom:9px;}\n#lm-root .lm-welcome h3 {font-size:18px;color:#233953;margin:0 0 9px;letter-spacing:-.25px;}\n#lm-root .lm-welcome p {font-size:13px;line-height:1.6;margin:8px 0;}\n#lm-root .lm-welcome .lm-muted {color:#91a1b4;font-size:12px;}\n#lm-root .lm-message {max-width:100%;}\n#lm-root .lm-msg-label {font-size:11px;text-transform:uppercase;letter-spacing:.7px;font-weight:750;color:#8295af;margin-bottom:6px;}\n#lm-root .lm-user {margin-left:20%;}\n#lm-root .lm-user .lm-msg-label {text-align:right;}\n#lm-root .lm-user .lm-msg-body {background:#e7efff;border:1px solid #dce7fc;padding:11px 13px;border-radius:12px 12px 3px 12px;color:#263e67;}\n#lm-root .lm-assistant .lm-msg-body {background:white;border:1px solid #e6eaf3;padding:12px 14px;border-radius:3px 12px 12px 12px;color:#344359;box-shadow:0 1px 2px rgba(23,36,55,.03);}\n#lm-root .lm-msg-body {font-size:13.3px;line-height:1.58;overflow-wrap:anywhere;}\n#lm-root .lm-msg-body .lm-paragraph { white-space:pre-line; }\n#lm-root .lm-msg-body .lm-paragraph + .lm-paragraph {margin-top:9px;}\n#lm-root .lm-msg-body code {background:#f0f4f9;border-radius:4px;padding:1px 3px;font-family:ui-monospace,Menlo,monospace;font-size:12px;}\n#lm-root .lm-msg-stamp {font-size:10px;color:#91a0b4;text-align:right;margin-top:5px;}\n#lm-root .lm-math {font-family:\"STIX Two Math\",\"Cambria Math\",Georgia,serif;color:#294f9c;white-space:normal;}\n#lm-root .lm-math-display {display:block;text-align:center;padding:8px 3px;font-family:\"STIX Two Math\",\"Cambria Math\",Georgia,serif;font-size:16px;color:#254b8b;}\n#lm-root .lm-board {margin:0 15px 8px 19px;border:1px solid #dbe5f4;background:white;border-radius:12px;padding:10px 12px 9px;max-height:285px;overflow-y:auto;flex-shrink:0;box-shadow:0 1px 5px rgba(30,60,95,.06);}\n#lm-root .lm-board-heading {display:flex;align-items:center;justify-content:space-between;color:#58739b;font-size:11px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;}\n#lm-root .lm-board-heading button {border:0;background:none;color:#91a0b3;text-transform:none;font-size:11px;}\n#lm-root .lm-diagram-title {text-align:center;font-weight:650;color:#435978;font-size:12px;}\n#lm-root .lm-board svg {display:block;width:100%;height:auto;max-height:224px;}\n#lm-root .lm-equation {font-family:\"STIX Two Math\",\"Cambria Math\",Georgia,serif;font-size:19px;color:#244b93;text-align:center;overflow-wrap:anywhere;padding:15px 6px;line-height:1.6;}\n#lm-root .lm-equation.lm-after-dag {padding:5px 2px 9px;font-size:15px;}\n#lm-root #lm-busy {display:flex;align-items:center;gap:8px;font-size:12px;padding:10px 18px;color:#637a99;flex-shrink:0;}\n#lm-root .lm-spinner {width:10px;height:10px;border-radius:50%;background:#5d85c4;animation:lm-pulse 1s infinite alternate;}\n@keyframes lm-pulse {to{opacity:.2;transform:scale(.6);}}\n#lm-root #lm-input-area {flex-shrink:0;background:white;border-top:1px solid #e4eaf3;padding:12px 16px 14px 20px;}\n#lm-root #lm-input {resize:vertical;min-height:55px;max-height:170px;width:100%;border:1px solid #dce3ef;border-radius:10px;background:#fbfcff;outline:none;padding:11px 12px;color:#20334b;line-height:1.45;font-size:13px;}\n#lm-root #lm-input:focus {border-color:#7197e8;box-shadow:0 0 0 2px #e4edff;}\n#lm-root .lm-input-actions {display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;}\n#lm-root #lm-hint {font-size:10px;color:#a3afc0;}\n#lm-root .lm-buttons {display:flex;gap:7px;align-items:center;}\n#lm-root .lm-buttons button {border:1px solid #dbe5ef;background:white;color:#5e7395;width:33px;height:33px;border-radius:9px;font-size:15px;}\n#lm-root .lm-buttons button:hover {background:#eef4ff;}\n#lm-root .lm-buttons button.lm-on {background:#eaf5ff;border-color:#a7c8ef;color:#326caa;}\n#lm-root #lm-mic.lm-listening {background:#ffedf0;color:#c8435e;border-color:#f1a9b9;animation:lm-pulse 1s infinite alternate;}\n#lm-root #lm-send {background:#3056a2;color:white;border-color:#3056a2;}\n#lm-root #lm-send:disabled {opacity:.4;cursor:wait;}\n#lm-root #lm-feedback {font-size:11px;color:#58856c;line-height:1.4;margin-top:6px;white-space:pre-wrap;max-height:90px;overflow-y:auto;}\n#lm-root #lm-feedback:empty {display:none;}\n#lm-root #lm-feedback.lm-error {color:#b45b5b;}\n#lm-root #lm-course-view, #lm-root #lm-about-view {background:#fcfdff;padding:20px 22px;color:#5b6980;line-height:1.5;}\n#lm-root .lm-view h3 {font-size:16px;margin:0 0 12px;color:#294469;}\n#lm-root .lm-view p {font-size:13px;margin:0 0 17px;}\n#lm-root .lm-view label {font-size:12px;font-weight:650;color:#4b6487;display:block;margin-bottom:8px;}\n#lm-root #lm-notes {border:1px solid #dce5f1;border-radius:8px;padding:11px;min-height:180px;width:100%;font:12px/1.6 ui-monospace,monospace;color:#2f4764;outline:none;background:#fff;resize:vertical;}\n#lm-root .lm-course-actions {display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:12px 0 13px;}\n#lm-root .lm-course-actions button, #lm-root .lm-file-button, #lm-root #lm-about-view button {background:#ecf2ff;border:1px solid #cddcf2;border-radius:8px;color:#355d9b;padding:9px 10px;font-size:12px;font-weight:650;cursor:pointer;}\n#lm-root #lm-file-button, #lm-root .lm-file-button {margin:0;}\n#lm-root #lm-save-notes {background:#2b559a;color:white;border-color:#2b559a;}\n#lm-root #lm-notes-feedback {font-size:12px;color:#3d826e;min-height:22px;}\n#lm-root .lm-small {font-size:11px !important;color:#95a3b3;line-height:1.55;}\n#lm-root .lm-setting-row {display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e6ebf1;padding:13px 0;font-size:13px;}\n#lm-root .lm-setting-row strong {font-size:12px;}\n#lm-root #lm-about-view button {margin:12px 0 10px;}\n#lm-root #lm-about-view button.lm-danger {display:block;margin-top:23px;background:#fff3f3;color:#a34949;border-color:#efc4c4;}\n@media (max-width:900px) {#lm-root #lm-hint {display:none;} }\n\n/* Per-answer voice replay and reopenable whiteboard controls. */\n#lm-root .lm-reply-actions {display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:7px;}\n#lm-root .lm-reply-action {font:600 11px -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;\n  background:#edf3ff;color:#345b96;border:1px solid #d5e1f5;border-radius:7px;padding:6px 9px;cursor:pointer;}\n#lm-root .lm-reply-action:hover {background:#dfeaff;}\n#lm-root .lm-reply-action[aria-pressed=\"true\"] {background:#feeef0;color:#af3851;border-color:#edc4cc;}\n#lm-root #lm-board-reopen {padding:7px 17px 9px 21px;flex-shrink:0;}\n#lm-root #lm-board-show {font:650 12px -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;\n  background:#eef4ff;border:1px solid #d3def2;border-radius:8px;color:#315b9b;padding:8px 12px;cursor:pointer;}\n#lm-root #lm-board-show:hover {background:#ddeaff;}\n#lm-root #lm-teaching-progress {margin-left:auto;margin-right:12px;text-transform:none;\n  letter-spacing:0;font-size:11px;color:#487bb4;}\n";document.documentElement.appendChild(style);
const S = {open:true,view:'chat',width:460,history:[],notes:'',videoId:'',videoTitle:'',transcript:[],transcriptState:'Not loaded',waiting:false,listening:false,recognition:null,voiceEnabled:false,boards:[],boardHidden:false,currentBoardVisual:null,currentBoardMessage:null};
const $ = (id) => document.getElementById(id);
const safeText = x => String(x ?? '');
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const videoId = () => new URL(location.href).searchParams.get('v') || '';
const isWatch = () => location.pathname === '/watch' && !!videoId();
const nowTime = () => Number(document.querySelector('video')?.currentTime || 0);
const timeLabel = seconds => {
  const n=Math.max(0,Math.floor(Number(seconds)||0));
  return `${Math.floor(n/3600)>0?Math.floor(n/3600)+':':''}${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
};

function storageGet(keys) {
  const names=Array.isArray(keys)?keys:[keys];
  const result={};
  for (const name of names) result[name]=GM_getValue(name);
  return Promise.resolve(result);
}
function storageSet(values) {
  return Promise.all(Object.entries(values).map(([key,value])=>Promise.resolve(GM_setValue(key,value))));
}
function gmRequest(url, method, data, timeout) {
  return new Promise((resolve,reject)=>{
    let finished=false;
    const timer=setTimeout(()=>finish(new Error('No response from '+new URL(url).hostname+' after '+Math.ceil(timeout/1000)+'s')),timeout+500);
    function finish(error,result){
      if(finished)return;
      finished=true;clearTimeout(timer);
      if(error)reject(error);else resolve(result);
    }
    try{
      GM_xmlhttpRequest({url,method,timeout,headers:data?{'Content-Type':'application/json'}:{},
        data:data?JSON.stringify(data):undefined,
        onload:resp=>{
          try{
            const result=JSON.parse(resp.responseText || '{}');
            if (resp.status<200 || resp.status>=300) throw Error(result.error||'HTTP '+resp.status);
            finish(null,result);
          }catch(e){finish(e);}
        },
        onerror:()=>finish(Error('Request blocked or local server unreachable')),
        ontimeout:()=>finish(Error('Request timed out')),
        onabort:()=>finish(Error('Request aborted'))
      });
    }catch(e){finish(e);}
  });
}
// Some Safari/Tampermonkey versions silently fail on numeric loopback IPs.
 // Prefer localhost while preserving 127.0.0.1 as a fallback.
async function localRequest(path,method,payload,timeout) {
  let lastError;
  for (const host of ['localhost','127.0.0.1']) {
    try {
      return await gmRequest('http://'+host+':8787'+path,method,payload,timeout);
    } catch(e) {lastError=e;}
  }
  throw new Error('Could not connect using localhost or 127.0.0.1: '+(lastError?.message||'unknown error'));
}
function sendMessage(message) {
  if (message?.type==='CHAT') return localRequest('/api/chat','POST',message.payload,90000);
  if (message?.type==='HEALTH') return localRequest('/health','GET',null,3500).then(data=>({...data,transport:'Tampermonkey'}));
  if (message?.type==='CAPTIONS') {
    let url;
    try{
      url=new URL(message.url);
      if(url.protocol!=='https:'||url.hostname!=='www.youtube.com'||url.pathname!=='/api/timedtext')throw Error('Invalid caption URL');
      url.searchParams.set('fmt','json3');
    }catch(_){return Promise.resolve({ok:false,error:'Caption URL unavailable'});}
    return gmRequest(url.href,'GET',null,14000).then(data=>({ok:true,segments:(data.events||[])
      .filter(e=>Array.isArray(e.segs))
      .map(e=>({start:Math.max(0,(e.tStartMs||0)/1000),text:e.segs.map(s=>s.utf8||'').join('').replace(/\s+/g,' ').trim()}))
      .filter(e=>e.text).slice(0,20000)}))
      .catch(e=>({ok:false,error:e.message}));
  }
  return Promise.resolve({ok:false,error:'Unknown action'});
}
const html = `
<div id="lm-launcher" title="Open LectureMate"><span>✦</span> Tutor</div>
<div id="lm-shell" role="complementary" aria-label="LectureMate AI tutor">
  <div id="lm-resize" title="Drag to resize tutor"></div>
  <header id="lm-header">
    <div class="lm-brand"><div class="lm-brand-icon">✦</div><div><strong>LectureMate</strong><small>Ask • Understand • Explore</small></div></div>
    <div class="lm-header-actions"><button id="lm-mini" title="Check connection">●</button><button id="lm-close" title="Hide tutor">✕</button></div>
  </header>
  <div class="lm-video-info"><div id="lm-title">YouTube lecture</div><div class="lm-status-row"><span id="lm-timestamp">0:00</span><span id="lm-context" title="Source context status">Looking for captions…</span></div></div>
  <nav id="lm-tabs"><button data-view="chat" class="lm-selected">Chat</button><button data-view="course">Course material</button><button data-view="about">Settings</button></nav>
  <section id="lm-chat-view" class="lm-view">
    <div id="lm-messages" aria-live="polite"></div>
    <div id="lm-board-reopen" hidden><button id="lm-board-show" type="button">▤ Show whiteboard</button></div>
    <div id="lm-board" class="lm-board" hidden>
      <div class="lm-board-heading"><strong>Whiteboard</strong><span id="lm-teaching-progress"></span><button id="lm-board-hide">Hide</button></div>
      <div id="lm-board-body"></div>
    </div>
    <div id="lm-busy" hidden><span class="lm-spinner"></span> Thinking about your question…</div>
    <div id="lm-input-area">
      <textarea id="lm-input" rows="2" placeholder="Ask anything about this topic…" aria-label="Type your question"></textarea>
      <div class="lm-input-actions">
        <span id="lm-hint">Enter to send · Shift+Enter for newline</span>
        <div class="lm-buttons">
          <button id="lm-speaker" title="Toggle spoken replies" aria-label="Toggle spoken replies">♬</button>
          <button id="lm-mic" title="Speak your question" aria-label="Speak your question">🎙</button>
          <button id="lm-send" title="Send question" aria-label="Send question">➤</button>
        </div>
      </div>
      <div id="lm-feedback" role="status"></div>
    </div>
  </section>
  <section id="lm-course-view" class="lm-view" hidden>
    <h3>Full course context</h3>
    <p>The tutor automatically reads YouTube’s built-in transcript when available (including timestamps). If it can’t open the transcript automatically, click “Show transcript” on YouTube and then “Retry captions” in Settings. You can also add materials from later lectures here.</p>
    <label for="lm-notes">Paste syllabus, slides, transcripts, or notes</label>
    <textarea id="lm-notes" rows="12" placeholder="Paste the course outline, lesson transcripts, notes, or reading material here…"></textarea>
    <div class="lm-course-actions"><label class="lm-file-button">Add .txt / .md / .srt / .vtt <input type="file" id="lm-file" accept=".txt,.md,.srt,.vtt,text/plain,text/markdown" multiple hidden></label><button id="lm-save-notes">Save context</button></div>
    <div id="lm-notes-feedback"></div>
    <p class="lm-small">Stored locally in Safari. The relevant parts are sent to your local tutor server when you ask a question. This MVP does not automatically fetch an entire YouTube playlist.</p>
  </section>
  <section id="lm-about-view" class="lm-view" hidden>
    <h3>Connection & preferences</h3>
    <div class="lm-setting-row"><span>Local AI server</span><strong id="lm-health">Checking…</strong></div>
    <button id="lm-check-health">Check connection</button>
    <div class="lm-setting-row"><span>Read answers aloud</span><input type="checkbox" id="lm-voice-toggle" /></div>
    <div class="lm-setting-row"><span>Model</span><strong id="lm-model">—</strong></div>
    <div class="lm-setting-row"><span>Caption availability</span><strong id="lm-caption-stat">—</strong></div>
    <button id="lm-refresh-captions">Retry captions</button>
    <button id="lm-clear-history" class="lm-danger">Clear this video's conversation</button>
    <p class="lm-small">Voice uses Safari's speech recognition and speech synthesis. Microphone availability varies by Safari version and permissions. Your API key stays in the local Node server, never in this extension.</p>
    <p class="lm-small">No visual frame recognition yet; the first version sees title, timestamp, captions where YouTube provides them, and pasted course materials.</p>
  </section>
</div>`;
// YouTube enforces Trusted Types for innerHTML. This markup is a static,
 // bundled LectureMate template (never user- or model-supplied HTML).
const trustedMarkup = globalThis.trustedTypes?.createPolicy
  ? globalThis.trustedTypes.createPolicy('lecturemate-static-ui-v011', {createHTML: value => value}).createHTML(html)
  : html;
const root=document.createElement('div'); root.id='lm-root'; root.innerHTML=trustedMarkup; document.body.appendChild(root);
const r=id=>root.querySelector('#'+id);
function setFeedback(message='',isError=false) {r('lm-feedback').textContent=message;r('lm-feedback').classList.toggle('lm-error',isError);}
function updatePosition() {
  root.style.setProperty('--lm-width',`${S.width}px`);
  document.documentElement.style.setProperty('--lm-width',`${S.width}px`);
  document.documentElement.classList.toggle('lm-active',S.open && isWatch());
  r('lm-shell').hidden=!(S.open&&isWatch());
  r('lm-launcher').hidden=(!isWatch()||S.open);
  window.dispatchEvent(new Event('resize'));
}
function setOpen(open) {S.open=!!open;updatePosition();storageSet({lm_open:S.open});}
r('lm-close').addEventListener('click',()=>setOpen(false));
r('lm-launcher').addEventListener('click',()=>setOpen(true));

function showView(view) {
  S.view=view;
  for(const v of ['chat','course','about']) r('lm-'+v+'-view').hidden=v!==view;
  root.querySelectorAll('#lm-tabs button').forEach(b=>b.classList.toggle('lm-selected',b.dataset.view===view));
  if(view==='about') checkHealth();
}
root.querySelectorAll('#lm-tabs button').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

let resizeX=null;
r('lm-resize').addEventListener('pointerdown',e=>{
  resizeX=e.pointerId;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
r('lm-resize').addEventListener('pointermove',e=>{
  if(resizeX!==e.pointerId)return;
  S.width=clamp(window.innerWidth-e.clientX,350,Math.min(860,window.innerWidth-240));
  updatePosition();
});
r('lm-resize').addEventListener('pointerup',e=>{
  if(resizeX!==e.pointerId)return;resizeX=null;storageSet({lm_width:S.width});
});

function create(tag,cls,txt) {const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=safeText(txt);return e;}
function latexText(raw) {
  let t=safeText(raw).replace(/\\left|\\right/g,'');
  const chars={'alpha':'α','beta':'β','gamma':'γ','delta':'δ','epsilon':'ε','theta':'θ','lambda':'λ','mu':'μ','sigma':'σ','tau':'τ','phi':'φ','pi':'π','Delta':'Δ','Sigma':'Σ','mathbb{E}':'𝔼','mathbb{P}':'ℙ','rightarrow':'→','to':'→','leftarrow':'←','Rightarrow':'⇒','infty':'∞','neq':'≠','approx':'≈','leq':'≤','geq':'≥','perp':'⊥','mid':'∣','times':'×','cdot':'·','sum':'∑','prod':'∏','in':'∈','partial':'∂','nabla':'∇','cap':'∩','cup':'∪','forall':'∀','exists':'∃','hat':'^','bar':'‾','mathrm':'','operatorname':''};
  t=t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,'($1)/($2)');
  t=t.replace(/\\([A-Za-z]+(?:\{[^{}]*\})?)/g,(m,k)=>Object.prototype.hasOwnProperty.call(chars,k)?chars[k]:m);
  t=t.replace(/\\[,;! ]/g,' ').replace(/[{}]/g,'').replace(/\s+/g,' ').trim();
  return t;
}
function addInline(parent,text) {
  const matcher=/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let pos=0,m;
  while((m=matcher.exec(text))!==null){
    if(m.index>pos) parent.appendChild(document.createTextNode(text.slice(pos,m.index)));
    if(m[1]!==undefined){const el=create('div','lm-math-display',latexText(m[1]));el.title=m[1];parent.appendChild(el);}
    else if(m[2]!==undefined){const el=create('span','lm-math',latexText(m[2]));el.title=m[2];parent.appendChild(el);}
    else if(m[3]!==undefined)parent.appendChild(create('code','',m[3]));
    else if(m[4]!==undefined)parent.appendChild(create('strong','',m[4]));
    pos=matcher.lastIndex;
  }
  if(pos<text.length)parent.appendChild(document.createTextNode(text.slice(pos)));
}
function renderProse(container,text) {
  for(const paragraph of safeText(text).split(/\n{2,}/)){
    const div=create('div','lm-paragraph');
    addInline(div,paragraph);
    container.appendChild(div);
  }
}
function addMessage(msg) {
  const wrap=create('article','lm-message '+(msg.role==='user'?'lm-user':'lm-assistant'));
  const label=create('div','lm-msg-label',msg.role==='user'?'You':'✦ Tutor');wrap.appendChild(label);
  const body=create('div','lm-msg-body');renderProse(body,msg.text||'');wrap.appendChild(body);
  if(msg.time!==undefined && msg.role==='user')wrap.appendChild(create('div','lm-msg-stamp','Asked at '+timeLabel(msg.time)));
  if(msg.role==='assistant'){
    const actions=create('div','lm-reply-actions');
    const listen=create('button','lm-reply-action lm-listen-button','▶ Listen');
    listen.type='button';listen.title='Hear this explanation, with whiteboard teaching steps';
    listen._lmMessage=msg;
    listen.addEventListener('click',()=>{
      if(teacher?.isPlaying(msg))stopSpeech();
      else playReply(msg);
    });
    actions.appendChild(listen);
    if(globalThis.LectureMateTeacher?.isVisual(msg.visual)){
      const diagram=create('button','lm-reply-action','▤ Whiteboard');
      diagram.type='button';diagram.title='Open the whiteboard for this answer';
      diagram.addEventListener('click',()=>showBoardForMessage(msg));
      actions.appendChild(diagram);
    }
    wrap.appendChild(actions);
  }
  r('lm-messages').appendChild(wrap);
  r('lm-messages').scrollTop=r('lm-messages').scrollHeight;
}
function updateListenButtons(){
  for(const button of root.querySelectorAll('.lm-listen-button')){
    const speaking=teacher?.isPlaying(button._lmMessage)||false;
    button.textContent=speaking?'■ Stop':'▶ Listen';
    button.setAttribute('aria-pressed',String(speaking));
    button.title=speaking?'Stop narration':'Listen to this explanation';
  }
}
function refreshBoardAccess(){
  r('lm-board-reopen').hidden=!S.currentBoardVisual || !S.boardHidden;
}
function renderMessages(){
  r('lm-messages').replaceChildren();
  if(!S.history.length){
    const welcome=create('div','lm-welcome');welcome.appendChild(create('div','lm-welcome-icon','✦'));
    welcome.appendChild(create('h3','', 'Your lecture, your questions.'));
    welcome.appendChild(create('p','', 'Pause whenever you want. Ask by typing or speaking, and explore the ideas together.'));
    welcome.appendChild(create('p','lm-muted','Try: “Can you explain the intuition behind this?” or “Draw a causal graph for this example.”'));
    r('lm-messages').appendChild(welcome);
  }else S.history.forEach(addMessage);
  // The diagram can be reopened after a page reload or a later question.
  if(!S.currentBoardVisual){
    const latest=[...S.history].reverse().find(m=>m.role==='assistant' && globalThis.LectureMateTeacher?.isVisual(m.visual));
    if(latest){S.currentBoardVisual=latest.visual;S.currentBoardMessage=latest;S.boardHidden=true;}
  }
  refreshBoardAccess();updateListenButtons();
}
function renderBoard(visual,index=0,total=0,done=true){
  if(!globalThis.LectureMateTeacher?.isVisual(visual))return;
  S.currentBoardVisual=visual;
  const board=r('lm-board-body');board.replaceChildren();
  board.appendChild(create('div','lm-diagram-title',visual.title||'Illustration'));
  if(visual.type==='equation'){
    const el=create('div','lm-equation',latexText(visual.latex));el.title=visual.latex||'';board.appendChild(el);
  }else drawDag(board,visual);
  r('lm-teaching-progress').textContent=total && !done?'Teaching '+index+'/'+total:'';
  r('lm-board').hidden=S.boardHidden;
  refreshBoardAccess();
}
function showBoardForMessage(msg){
  if(!globalThis.LectureMateTeacher?.isVisual(msg?.visual))return;
  // Selecting another diagram interrupts any currently narrated lesson.
  stopSpeech();
  S.currentBoardMessage=msg;S.boardHidden=false;
  renderBoard(msg.visual);
}
const NS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs={},text){const el=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=safeText(text);return el;}
function drawDag(host,data){
  const svg=svgNode('svg',{viewBox:'0 0 420 245',role:'img','aria-label':data.title||'Causal diagram'});
  const defs=svgNode('defs');const marker=svgNode('marker',{id:'lm-arrow',markerWidth:9,markerHeight:9,refX:8,refY:4.5,orient:'auto'});marker.appendChild(svgNode('path',{d:'M0,0 L9,4.5 L0,9 Z',fill:'#7a8ea9'}));defs.appendChild(marker);svg.appendChild(defs);
  const nodes=(Array.isArray(data.nodes)?data.nodes:[]).slice(0,10).map(n=>({id:safeText(n.id).slice(0,50),label:safeText(n.label).slice(0,40),x:42+clamp(Number(n.x)||0,0,1)*336,y:27+clamp(Number(n.y)||0,0,1)*188}));
  const byId=new Map(nodes.map(n=>[n.id,n]));
  for(const ed of (Array.isArray(data.edges)?data.edges:[]).slice(0,16)){
    const a=byId.get(safeText(ed.from)),b=byId.get(safeText(ed.to));if(!a||!b||a===b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
    svg.appendChild(svgNode('line',{x1:a.x+ux*31,y1:a.y+uy*21,x2:b.x-ux*37,y2:b.y-uy*24,stroke:'#7a8ea9','stroke-width':2,'marker-end':'url(#lm-arrow)'}));
    if(ed.label){const pos=svgNode('text',{x:(a.x+b.x)/2+uy*10,y:(a.y+b.y)/2-ux*10,'text-anchor':'middle','font-size':11,fill:'#63748c'});pos.textContent=safeText(ed.label).slice(0,25);svg.appendChild(pos);}
  }
  for(const n of nodes){
    svg.appendChild(svgNode('rect',{x:n.x-49,y:n.y-22,width:98,height:44,rx:11,fill:'#e9f0ff',stroke:'#8ba8e0','stroke-width':1.5}));
    const txt=svgNode('text',{x:n.x,y:n.y+4,'text-anchor':'middle','font-family':'-apple-system,sans-serif','font-size':11,fill:'#25446c'});
    const words=n.label.split(' ');if(n.label.length>17&&words.length>1){
      const mid=Math.ceil(words.length/2);
      txt.setAttribute('y',n.y-3);
      txt.appendChild(svgNode('tspan',{x:n.x,dy:'0'},words.slice(0,mid).join(' ').slice(0,22)));
      txt.appendChild(svgNode('tspan',{x:n.x,dy:'13'},words.slice(mid).join(' ').slice(0,22)));
    }else txt.textContent=n.label;
    svg.appendChild(txt);
  }
  host.appendChild(svg);
  if(data.latex){const math=create('div','lm-equation lm-after-dag',latexText(data.latex));math.title=data.latex;host.appendChild(math);}
}

const teacher=globalThis.LectureMateTeacher?.createPlayer({
  onFrame:(frame,index,total,done)=>renderBoard(frame,index,total,done),
  onChange:(_msg,playing,index,total)=>{
    updateListenButtons();
    if(!playing)r('lm-teaching-progress').textContent='';
  },
  onError:message=>setFeedback(message,true)
});
function stopSpeech(){teacher?.stop();}
function playReply(msg){
  if(!teacher){setFeedback('Audio playback module is missing. Reload the Safari extension.',true);return;}
  S.currentBoardMessage=msg;
  if(globalThis.LectureMateTeacher?.isVisual(msg?.visual)){
    S.boardHidden=false;
  }
  if(!teacher.play(msg))setFeedback('This reply has no spoken explanation.',true);
}
function setVoiceEnabled(enabled){S.voiceEnabled=!!enabled;r('lm-voice-toggle').checked=S.voiceEnabled;r('lm-speaker').classList.toggle('lm-on',S.voiceEnabled);r('lm-speaker').title=S.voiceEnabled?'Spoken replies on':'Spoken replies off';storageSet({lm_voice:S.voiceEnabled});if(!S.voiceEnabled)stopSpeech();}
r('lm-speaker').addEventListener('click',()=>setVoiceEnabled(!S.voiceEnabled));
r('lm-voice-toggle').addEventListener('change',e=>setVoiceEnabled(e.target.checked));
function listen(){
  if(S.listening){S.recognition?.stop();return;}
  const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechAPI){setFeedback('Speech recognition unavailable. Use macOS Dictation in the text box instead.',true);r('lm-input').focus();return;}
  stopSpeech();
  try{
    const recognition=new SpeechAPI();recognition.lang='en-US';recognition.interimResults=true;recognition.continuous=false;
    S.recognition=recognition;
    const initial=r('lm-input').value.trim();
    recognition.onstart=()=>{S.listening=true;r('lm-mic').classList.add('lm-listening');setFeedback('Listening… tap the mic to stop.');};
    recognition.onresult=event=>{
      let transcript='',finalText='';
      for(let i=0;i<event.results.length;i++){
        transcript+=event.results[i][0].transcript+' ';
        if(event.results[i].isFinal)finalText+=event.results[i][0].transcript+' ';
      }
      r('lm-input').value=(initial?initial+' ':'')+transcript.trim();
      if(finalText.trim())recognition._final=true;
    };
    recognition.onerror=event=>setFeedback('Microphone: '+(event.error||'unknown error')+'. You can type instead.',true);
    recognition.onend=()=>{
      S.listening=false;r('lm-mic').classList.remove('lm-listening');
      if(recognition._final&&r('lm-input').value.trim())ask(true);
      else if(!r('lm-feedback').classList.contains('lm-error'))setFeedback('');
    };
    recognition.start();
  }catch(e){setFeedback('Could not start microphone: '+e.message,true);}
}
r('lm-mic').addEventListener('click',listen);

async function ask(fromVoice=false){
  const question=r('lm-input').value.trim();if(!question||S.waiting)return;
  if(!S.videoId){setFeedback('Open a YouTube video first.',true);return;}
  stopSpeech();
  const time=nowTime();document.querySelector('video')?.pause();
  const previous=S.history.map(h=>({role:h.role,text:h.text}));
  S.history.push({role:'user',text:question,time});r('lm-input').value='';renderMessages();
  setFeedback('');S.waiting=true;r('lm-send').disabled=true;r('lm-busy').hidden=false;
  try{
    const response=await sendMessage({type:'CHAT',payload:{question,history:previous,video:{id:S.videoId,title:S.videoTitle,time,url:location.href,transcript:S.transcript},playlistId:globalThis.LectureMatePlaylist?.currentId()||'',courseNotes:S.notes}});
    if(!response?.ok)throw Error(response?.error||'Tutor server did not respond');
    const msg={role:'assistant',text:safeText(response.answer),spoken:safeText(response.spoken),visual:response.visual||{type:'none'},teachingSteps:Array.isArray(response.teachingSteps)?response.teachingSteps:[]};
    S.history.push(msg);addMessage(msg);
    if(globalThis.LectureMateTeacher?.isVisual(msg.visual)){
      S.currentBoardMessage=msg;S.boardHidden=false;
      renderBoard(msg.visual);
    }
    // Keep the previous diagram available when a follow-up answer has no new visual.
    if(S.voiceEnabled||fromVoice)playReply(msg);
    storageSet({['lm_history_'+S.videoId]:S.history.slice(-60)});
  }catch(e){
    const message=safeText(e.message||e);
    setFeedback(message,true);addMessage({role:'assistant',text:'Could not answer yet: '+message+'\n\nCheck Settings → Local AI server.'});
  }finally{S.waiting=false;r('lm-busy').hidden=true;r('lm-send').disabled=false;r('lm-input').focus();}
}
r('lm-send').addEventListener('click',()=>ask(false));
r('lm-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(false);}});
r('lm-board-hide').addEventListener('click',()=>{
  S.boardHidden=true;r('lm-board').hidden=true;refreshBoardAccess();
});
r('lm-board-show').addEventListener('click',()=>{
  if(!S.currentBoardVisual)return;
  S.boardHidden=false;renderBoard(S.currentBoardVisual);
});

function currentVideoTitle(){return document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent?.trim()||document.querySelector('h1.title yt-formatted-string')?.textContent?.trim()||document.title.replace(' - YouTube','');}
// Shared with the native extension and the packaged userscript.
const Transcript = globalThis.LectureMateTranscript;
function transcriptFromDOM(){return Transcript.readRows(document);}
function extractObject(text,searchIndex){
  const start=text.indexOf('{',searchIndex);if(start<0)return null;
  let depth=0,inString=false,escape=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];if(inString){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')inString=false;continue;}
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth++;if(ch==='}')depth--;
    if(depth===0){try{return JSON.parse(text.slice(start,i+1));}catch(_){return null;}}
  }
  return null;
}
function findPlayerResponse(){
  // On a fresh YouTube watch page, the serialized player response is in an inline script.
  try {
    const player=document.querySelector('#movie_player');
    if(typeof player?.getPlayerResponse==='function'){
      const v=player.getPlayerResponse();if(v?.videoDetails?.videoId===S.videoId)return v;
    }
  } catch(_){}
  for(const script of document.scripts){
    const text=script.textContent||'';
    const marker='ytInitialPlayerResponse';const idx=text.indexOf(marker);
    if(idx===-1)continue;
    const parsed=extractObject(text,idx+marker.length);
    if(parsed?.videoDetails?.videoId===S.videoId)return parsed;
  }
  return null;
}
async function loadCaptions(){
  const currentId=S.videoId;
  S.transcript=[];S.transcriptState='Reading YouTube transcript…';updateContextStatus();
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const current=()=>S.videoId===currentId;
  let segments=transcriptFromDOM(),openedByUs=false;
  // YouTube changed its transcript rows in late 2026. Prefer the transcript
  // displayed by its own UI, instead of downloading undocumented timedtext URLs.
  if(!segments.length){
    for(let trial=0;trial<3 && current() && !segments.length;trial++){
      let show=Transcript.showButton(document);
      if(!show && trial===0){
        const expand=Transcript.expandDescription(document);
        if(expand){expand.click();await sleep(450);}
        show=Transcript.showButton(document);
      }
      if(show && !openedByUs){
        show.click();openedByUs=true;
      }
      for(let attempt=0;attempt<9 && current();attempt++){
        await sleep(350);
        segments=transcriptFromDOM();
        if(segments.length){
          await sleep(350); // Allow YouTube's final transcript rows to settle.
          const settled=transcriptFromDOM();
          if(settled.length>=segments.length)segments=settled;
          break;
        }
      }
    }
  }
  if(!current())return;
  if(segments.length){
    S.transcript=segments;
    S.transcriptState='YouTube transcript: '+segments.length+' timestamped segments';
    updateContextStatus();
    if(openedByUs)Transcript.closePanel(document);
    return;
  }

  // Fall back to the original caption-track approach if YouTube did not expose
  // its own transcript panel. Signed timedtext URLs may now return empty bodies.
  S.transcriptState='Transcript panel unavailable; checking caption track…';
  updateContextStatus();
  let tracks=[];
  for(let trial=0;trial<2;trial++){
    const player=findPlayerResponse();
    tracks=player?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];
    if(tracks.length)break;
    if(trial<1)await sleep(600);
    if(!current())return;
  }
  tracks.sort((a,b)=>Number((b.languageCode||'').startsWith('en'))-Number((a.languageCode||'').startsWith('en')));
  for(const track of tracks.slice(0,2)){
    try{
      const response=await sendMessage({type:'CAPTIONS',url:track.baseUrl});
      if(!current())return;
      if(response?.ok && Array.isArray(response.segments) && response.segments.length){
        S.transcript=response.segments;
        S.transcriptState='Captions: '+S.transcript.length+' timestamped segments';
        updateContextStatus();return;
      }
    }catch(_){}
  }
  if(!current())return;
  S.transcript=transcriptFromDOM();
  S.transcriptState=S.transcript.length
    ?'YouTube transcript: '+S.transcript.length+' timestamped segments'
    :'Transcript unavailable — open YouTube “Show transcript”, then Retry captions';
  updateContextStatus();
}
function updateContextStatus(){r('lm-context').textContent=S.transcriptState;r('lm-context').title=S.transcriptState;r('lm-caption-stat').textContent=S.transcriptState;}
function updateTime(){r('lm-timestamp').textContent='At '+timeLabel(nowTime());}
async function onNavigation(force=false){
  if(!isWatch()){updatePosition();return;}
  const current=videoId();if(current===S.videoId&&!force)return;
  stopSpeech();S.currentBoardVisual=null;S.currentBoardMessage=null;S.boardHidden=true;S.videoId=current;S.videoTitle=currentVideoTitle();S.transcript=[];S.transcriptState='Looking for captions…';S.history=[];
  const saved=await storageGet('lm_history_'+current);
  if(current!==S.videoId)return;
  S.history=Array.isArray(saved['lm_history_'+current])?saved['lm_history_'+current]:[];
  r('lm-title').textContent=S.videoTitle;
  r('lm-board').hidden=true;renderMessages();updatePosition();updateTime();loadCaptions();
}
// Test the actual Tampermonkey transport first. When it fails, check whether
// the page itself can reach a read-only CORS health endpoint. A successful
// direct fetch does NOT imply that chat is authorized or working.
async function checkHealth(){
  const el=r('lm-health');
  el.textContent='Checking Tampermonkey…';
  r('lm-check-health').textContent='Checking…';
  r('lm-check-health').disabled=true;
  let timer;
  try{
    const data=await Promise.race([
      sendMessage({type:'HEALTH'}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tampermonkey timed out')),9500);})
    ]);
    const channel=data?.transport || (ext?.runtime?.onMessage?.addListener ? 'Extension messaging' : 'Unknown');
    if(data?.ok === true) {
      el.textContent=data.configured?'Connected ✓':'Needs API key';
      el.className=data.configured?'lm-success':'lm-warning';
      r('lm-model').textContent=data?.model||'—';
      r('lm-mini').className=data.configured?'lm-success':'lm-warning';
      setFeedback('');
    } else {
      const reason=String(data?.error || 'No valid response from the extension background');
      el.textContent='Offline — '+reason;
      el.className='lm-warning';
      r('lm-mini').className='lm-warning';
      r('lm-model').textContent='—';
      console.warn('[LectureMate] Health check failed via '+channel+':',reason);
      setFeedback('Connection via '+channel+': '+reason,true);
    }
  }catch(gmError){
    el.textContent='Checking browser access…';
    const controller=new AbortController();
    const abortTimer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch('http://127.0.0.1:8787/health',{signal:controller.signal,mode:'cors',cache:'no-store',credentials:'omit'});
      const data=await response.json();
      if(!response.ok || !data.ok)throw Error('HTTP '+response.status);
      el.textContent='Browser reaches server; Tampermonkey is blocked';
      r('lm-model').textContent=data?.model||'—';
      setFeedback('Your AI server is healthy, but Tampermonkey cannot contact it. Chat is not connected yet.',true);
    }catch(e){
      const diagnostic=String(e?.message||e);
      el.textContent='Offline — Safari local request blocked';
      r('lm-model').textContent='—';
      setFeedback('Tampermonkey: '+(gmError?.message||gmError)+'. Browser fetch: '+diagnostic+'. See Safari Console for CSP, CORS, or mixed-content errors.',true);
    }finally{clearTimeout(abortTimer);}
    el.className='lm-warning';r('lm-mini').className='lm-warning';
  }finally{clearTimeout(timer);r('lm-check-health').disabled=false;r('lm-check-health').textContent='Check connection';}
}
r('lm-mini').addEventListener('click',()=>showView('about'));
r('lm-check-health').addEventListener('click',checkHealth);
r('lm-refresh-captions').addEventListener('click',loadCaptions);
r('lm-clear-history').addEventListener('click',async()=>{
  S.history=[];renderMessages();r('lm-board').hidden=true;
  await storageSet({['lm_history_'+S.videoId]:[]});showView('chat');
});
r('lm-save-notes').addEventListener('click',()=>{
  S.notes=r('lm-notes').value.slice(0,490000);storageSet({lm_notes:S.notes});r('lm-notes-feedback').textContent=`Saved ${S.notes.length.toLocaleString()} characters of course context.`;
});
r('lm-file').addEventListener('change',async e=>{
  try{
    const files=Array.from(e.target.files||[]).slice(0,12);
    for(const file of files){
      if(file.size>2_000_000)throw Error(`${file.name} is too large for this version (2 MB limit per file)`);
      const text=await file.text();r('lm-notes').value+=`\n\n===== ${file.name} =====\n${text}`;
    }
    S.notes=r('lm-notes').value.slice(0,490000);r('lm-notes').value=S.notes;
    await storageSet({lm_notes:S.notes});r('lm-notes-feedback').textContent=`Added ${files.length} file(s); course context saved.`;
  }catch(e){r('lm-notes-feedback').textContent=e.message;}
  e.target.value='';
});
async function init(){
  const saved=await storageGet(['lm_notes','lm_voice','lm_width','lm_open']);
  S.notes=safeText(saved.lm_notes||'');r('lm-notes').value=S.notes;
  S.width=clamp(Number(saved.lm_width)||460,350,860);
  S.open=saved.lm_open!==false;
  setVoiceEnabled(saved.lm_voice===true);
  updatePosition();renderMessages();onNavigation(true);checkHealth();
}
try{ext.runtime.onMessage.addListener(message=>{if(message?.type==='TOGGLE_PANEL')setOpen(!S.open);});}catch(_){}
window.addEventListener('yt-navigate-finish',()=>setTimeout(()=>onNavigation(),350));
window.addEventListener('popstate',()=>setTimeout(()=>onNavigation(),350));
setInterval(()=>{
  if(!isWatch())return;
  if(videoId()!==S.videoId)onNavigation();
  updateTime();
  const title=currentVideoTitle();if(title!==S.videoTitle){S.videoTitle=title;r('lm-title').textContent=title;}
  if(!S.transcript.length){const seg=transcriptFromDOM();if(seg.length){S.transcript=seg;S.transcriptState='YouTube transcript: '+seg.length+' timestamped segments';updateContextStatus();}}
},2500);
init();
globalThis.LectureMatePlaylist?.init({S,sendMessage,r});
})();

