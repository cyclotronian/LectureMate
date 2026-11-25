#!/usr/bin/env node
/** Build one self-contained Tampermonkey userscript from the Safari extension's CSS and JS.
 * No network calls or npm dependencies. The API key remains in the separate local server.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'extension/content.js'),'utf8');
const transcriptSource = fs.readFileSync(path.join(root,'extension/transcript.js'),'utf8');
const playlistSource = fs.readFileSync(path.join(root,'extension/playlist-ui.js'),'utf8');
const css = fs.readFileSync(path.join(root,'extension/content.css'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
const version = manifest.version;

const helperStart = 'function storageGet(keys) {';
const helperEnd = 'const html = `';
if (!source.includes(helperStart) || !source.includes(helperEnd)) throw Error('Extension helpers changed: update userscript conversion');
const helpers = String.raw`
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
`;
const prefix=source.slice(0,source.indexOf(helperStart));
const suffix=source.slice(source.indexOf(helperEnd));
const updatedPrefix=prefix.replace('const ext = globalThis.browser || globalThis.chrome;',
  'const ext = {runtime:{onMessage:{addListener:()=>{}}}};\n' +
  'const style=document.createElement("style");style.textContent='+JSON.stringify(css)+';document.documentElement.appendChild(style);');
if (prefix===updatedPrefix) throw Error('Could not replace extension runtime in userscript');
const body=transcriptSource+'\n'+playlistSource+'\n'+updatedPrefix+helpers+suffix;
const downloadURL=process.env.LECTUREMATE_USERSCRIPT_URL || 'https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.user.js';
const updateURL=process.env.LECTUREMATE_UPDATE_METADATA_URL || 'https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.meta.js';
if (!/^https:\/\//.test(downloadURL) || !/^https:\/\//.test(updateURL)) throw Error('Userscript URLs must be HTTPS');
const metadata=[
  '// ==UserScript==',
  '// @name         LectureMate - AI Video Tutor',
  '// @namespace    https://github.com/cyclotronian/LectureMate',
  '// @version      '+version,
  '// @description  Ask contextual questions by typing or voice beside YouTube; get visual explanations.',
  '// @match        https://www.youtube.com/*',
  '// @run-at       document-end',
  '// @grant        GM_getValue',
  '// @grant        GM_setValue',
  '// @grant        GM_xmlhttpRequest',
  '// @connect      localhost',
  '// @connect      127.0.0.1',
  '// @connect      www.youtube.com',
  '// @updateURL    '+updateURL,
  '// @downloadURL  '+downloadURL,
  '// ==/UserScript==','',
];
const result=metadata.join('\n')+body+'\n';
const out=path.join(root,'dist/LectureMate.user.js');
fs.writeFileSync(out,result,'utf8');
const meta=path.join(root,'dist/LectureMate.meta.js');
fs.writeFileSync(meta,metadata.join('\n'),'utf8');
console.log(`Built ${path.relative(root,out)} and ${path.relative(root,meta)} (v${version}; GitHub update metadata configured)`);
