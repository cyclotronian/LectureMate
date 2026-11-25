(() => {
'use strict';
if (window.__lectureMateLoaded) return;
window.__lectureMateLoaded = true;
const ext = globalThis.browser || globalThis.chrome;
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
  return new Promise(resolve => {
    try {
      if (globalThis.browser?.storage?.local) Promise.resolve(browser.storage.local.get(keys)).then(resolve,()=>resolve({}));
      else chrome.storage.local.get(keys, r=>resolve(r||{}));
    } catch (_) {resolve({});}
  });
}
function storageSet(values) {
  try {
    if (globalThis.browser?.storage?.local) return Promise.resolve(browser.storage.local.set(values));
    return new Promise(resolve => chrome.storage.local.set(values,resolve));
  } catch (_) {return Promise.resolve();}
}
function sendMessage(message) {
  return new Promise((resolve,reject) => {
    try {
      if (globalThis.browser?.runtime?.sendMessage) {
        Promise.resolve(browser.runtime.sendMessage(message)).then(resolve,reject);
      } else {
        chrome.runtime.sendMessage(message,result=> {
          if (chrome.runtime.lastError) reject(Error(chrome.runtime.lastError.message)); else resolve(result);
        });
      }
    } catch(e) {reject(e);}
  });
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
  if(teacher?.isPlaying(msg))stopSpeech();
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
    S.currentBoardMessage=msg;S.currentBoardVisual=null;S.boardHidden=false;
    renderBoard(msg.visual);
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
