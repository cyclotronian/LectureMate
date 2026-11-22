#!/usr/bin/env node
/** Build one self-contained Tampermonkey userscript from the Safari extension's CSS and JS.
 * No network calls or npm dependencies. The API key remains in the separate local server.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'extension/content.js'),'utf8');
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
    GM_xmlhttpRequest({url,method,timeout,headers:data?{'Content-Type':'application/json'}:{},
      data:data?JSON.stringify(data):undefined,
      onload:resp=>{
        try{
          const result=JSON.parse(resp.responseText || '{}');
          if (resp.status<200 || resp.status>=300) throw Error(result.error||'HTTP '+resp.status);
          resolve(result);
        }catch(e){reject(e);}
      },
      onerror:()=>reject(Error('Could not connect to the requested service')),
      ontimeout:()=>reject(Error('Request timed out'))
    });
  });
}
function sendMessage(message) {
  if (message?.type==='CHAT') return gmRequest('http://127.0.0.1:8787/api/chat','POST',message.payload,90000);
  if (message?.type==='HEALTH') return gmRequest('http://127.0.0.1:8787/health','GET',null,4000);
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
const body=updatedPrefix+helpers+suffix;
const updateURL=process.env.LECTUREMATE_USERSCRIPT_URL || 'https://raw.githubusercontent.com/cyclotronian/LectureMate/main/dist/LectureMate.user.js';
if (updateURL && !/^https:\/\//.test(updateURL)) throw Error('LECTUREMATE_USERSCRIPT_URL must be HTTPS');
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
  '// @connect      127.0.0.1',
  '// @connect      www.youtube.com',
  ...(updateURL?['// @updateURL    '+updateURL,'// @downloadURL  '+updateURL]:[]),
  '// ==/UserScript==','',
];
const result=metadata.join('\n')+body+'\n';
const out=path.join(root,'dist/LectureMate.user.js');
fs.writeFileSync(out,result,'utf8');
console.log(`Built ${path.relative(root,out)} (${result.length} bytes, v${version}; auto-update ${updateURL?'configured':'requires a public GitHub URL'})`);
