/** Local playlist transcript index. No video/audio download; only subtitle files.
 * All external URLs are constructed from validated YouTube IDs.
 */
'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const CACHE=process.env.LECTUREMATE_PLAYLIST_DIR ||
  path.join(os.homedir(),'Library','Application Support','LectureMate','playlists');
const MAX_VIDEOS=40;
const memory=new Map();
const jobs=new Map();
const validPlaylistId=id=>typeof id==='string' && /^[A-Za-z0-9_-]{10,64}$/.test(id);
const validVideoId=id=>typeof id==='string' && /^[A-Za-z0-9_-]{11}$/.test(id);
function safeTitle(x){return String(x||'').replace(/\s+/g,' ').slice(0,180).trim();}
function normalizedSegments(input){
  if(!Array.isArray(input))return [];
  const out=[], seen=new Set();
  for(const x of input.slice(0,8000)){
    const start=Number(x?.start),text=String(x?.text||'').replace(/\s+/g,' ').trim().slice(0,1200);
    if(!Number.isFinite(start)||start<0||!text)continue;
    const key=Math.floor(start)+'\0'+text;
    if(seen.has(key))continue;
    seen.add(key);out.push({start:Math.round(start*100)/100,text});
    if(out.length>=5000)break;
  }
  return out.sort((a,b)=>a.start-b.start);
}
function fresh(id){return {playlistId:id,title:'',videos:[],status:'new',attempted:0,error:'',updatedAt:Date.now(),truncated:false};}
function fileFor(id){if(!validPlaylistId(id))throw Error('Invalid playlist ID');return path.join(CACHE,id+'.json');}
function get(id){
  if(!validPlaylistId(id))throw Error('Invalid playlist ID');
  if(memory.has(id))return memory.get(id);
  let state=fresh(id);
  try{
    const parsed=JSON.parse(fs.readFileSync(fileFor(id),'utf8'));
    if(parsed.playlistId===id && Array.isArray(parsed.videos))state={...state,...parsed,status:parsed.status==='indexing'?'partial':parsed.status};
  }catch(e){if(e.code!=='ENOENT')console.warn('[LectureMate] Playlist cache:',e.message);}
  memory.set(id,state);return state;
}
function save(state){
  state.updatedAt=Date.now();
  fs.mkdirSync(CACHE,{recursive:true,mode:0o700});
  const target=fileFor(state.playlistId),tmp=target+'.tmp-'+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});
  fs.renameSync(tmp,target);
}
function merge(state,videos,current){
  const combined=new Map(state.videos.map(x=>[x.id,x]));
  for(const item of (Array.isArray(videos)?videos:[]).slice(0,MAX_VIDEOS)){
    if(!validVideoId(item?.id))continue;
    const old=combined.get(item.id)||{id:item.id,title:'',segments:[],error:''};
    old.title=safeTitle(item.title)||old.title;
    combined.set(item.id,old);
  }
  if(validVideoId(current?.id)){
    const old=combined.get(current.id)||{id:current.id,title:'',segments:[],error:''};
    old.title=safeTitle(current.title)||old.title;
    const segments=normalizedSegments(current.transcript);
    if(segments.length>=old.segments.length){old.segments=segments;old.error='';}
    combined.set(current.id,old);
  }
  state.videos=[...combined.values()].slice(0,MAX_VIDEOS);
  state.truncated=combined.size>MAX_VIDEOS;
}
function status(id){
  const s=get(id),indexed=s.videos.filter(v=>v.segments?.length).length;
  return {ok:true,playlistId:id,title:s.title,total:s.videos.length,indexed,
    attempted:s.attempted||0,state:s.status,error:s.error||'',truncated:!!s.truncated,
    ytDlpRequired:s.status==='missing-tool'};
}
function upsert(payload){
  const id=payload?.playlistId;
  if(!validPlaylistId(id))throw Error('Invalid playlist ID');
  const s=get(id);
  if(payload.title)s.title=safeTitle(payload.title);
  merge(s,payload.videos,payload.current);
  save(s);
  if(payload.force || ['new','partial'].includes(s.status))startIndexing(id,!!payload.force);
  return status(id);
}
function parseVtt(text){
  const lines=String(text||'').replace(/\r/g,'').split('\n');
  const out=[],time=/((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->/;
  const stamp=s=>{const parts=s.replace(',','.').split(':').map(Number);return parts.reduce((a,b)=>a*60+b,0)};
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(time);
    if(!m)continue;
    const block=[];
    for(i++;i<lines.length && lines[i].trim();i++){
      if(lines[i].includes('-->'))break;
      block.push(lines[i].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&'));
    }
    const value=block.join(' ').replace(/\s+/g,' ').trim();
    if(value)out.push({start:stamp(m[1]),text:value});
  }
  return normalizedSegments(out);
}
function parseJson3(text){
  const p=JSON.parse(text);
  return normalizedSegments((p.events||[]).filter(x=>Array.isArray(x.segs)).map(e=>({
    start:Math.max(0,Number(e.tStartMs||0)/1000),
    text:e.segs.map(x=>x.utf8||'').join('').trim()
  })));
}
function run(command,args,timeoutMs){
  return new Promise((resolve,reject)=>{
    let output='',err='';
    const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],shell:false});
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
    child.stdout.on('data',b=>{output+=b; if(output.length>10_000_000)child.kill('SIGKILL')});
    child.stderr.on('data',b=>{err+=b; if(err.length>2000)err=err.slice(-2000)});
    child.once('error',e=>{clearTimeout(timer);reject(e)});
    child.once('close',code=>{
      clearTimeout(timer);
      if(code===0)resolve(output);
      else reject(Error('yt-dlp exited '+code+': '+err.slice(-350)));
    });
  });
}
function ytDlpBinary(){return process.env.LECTUREMATE_YT_DLP || 'yt-dlp';}
async function discover(id){
  const text=await run(ytDlpBinary(),['--no-config','--flat-playlist','--dump-single-json','--playlist-end',String(MAX_VIDEOS+1),'--no-warnings','--','https://www.youtube.com/playlist?list='+id],60000);
  const p=JSON.parse(text);
  return {title:safeTitle(p.title),videos:(p.entries||[]).filter(v=>validVideoId(v.id))
    .slice(0,MAX_VIDEOS).map(v=>({id:v.id,title:safeTitle(v.title)})),
    truncated:(p.entries||[]).length>MAX_VIDEOS};
}
function findSubtitleFiles(dir,id){
  const files=fs.readdirSync(dir).filter(n=>n.startsWith(id+'.') && /\.(json3|vtt)$/.test(n));
  return files.sort((a,b)=>(a.includes('.en.')?0:1)-(b.includes('.en.')?0:1));
}
async function fetchSubtitles(id){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lecturemate-subs-'));
  try{
    const template=path.join(dir,'%(id)s.%(ext)s');
    await run(ytDlpBinary(),['--no-config','--ignore-errors','--skip-download',
      '--no-playlist','--write-subs','--write-auto-subs','--sub-langs','en,en-orig',
      '--sub-format','json3/vtt','--no-warnings','--no-progress',
      '-o',template,'--','https://www.youtube.com/watch?v='+id],45000);
    for(const name of findSubtitleFiles(dir,id)){
      try{
        const body=fs.readFileSync(path.join(dir,name),'utf8');
        const seg=name.endsWith('.json3')?parseJson3(body):parseVtt(body);
        if(seg.length)return seg;
      }catch(_){}
    }
    return [];
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function startIndexing(id,force=false){
  if(jobs.has(id))return;
  const s=get(id);
  if(!force && ['complete','missing-tool','indexing'].includes(s.status))return;
  s.status='indexing';s.error='';save(s);
  const job=(async()=>{
    let discoveryError='';
    try{
      const playlist=await discover(id);
      merge(s,playlist.videos);
      if(playlist.title)s.title=playlist.title;
      s.truncated=s.truncated||playlist.truncated;
      save(s);
    }catch(e){
      if(e.code==='ENOENT'){
        s.status='missing-tool';
        s.error='Install yt-dlp to index the other playlist videos (brew install yt-dlp). Transcripts from videos you watch are still saved.';
        save(s);return;
      }
      discoveryError=e.message;
    }
    const items=[...s.videos];
    for(const v of items){
      if(v.segments?.length)continue;
      try{
        const seg=await fetchSubtitles(v.id);
        const video=s.videos.find(x=>x.id===v.id);
        if(video && seg.length){video.segments=seg;video.error='';}
        else if(video)video.error='No English subtitles available';
      }catch(e){
        if(e.code==='ENOENT'){
          s.status='missing-tool';s.error='Install yt-dlp to index the other playlist videos (brew install yt-dlp).';
          save(s);return;
        }
        const video=s.videos.find(x=>x.id===v.id);
        if(video)video.error=String(e.message).slice(0,160);
      }
      s.attempted++;save(s);
    }
    s.status=s.videos.every(v=>v.segments?.length)?'complete':'partial';
    s.error=discoveryError?('Playlist discovery was incomplete: '+discoveryError.slice(0,180)):'';
    save(s);
  })().catch(e=>{s.status='partial';s.error=e.message;save(s)}).finally(()=>jobs.delete(id));
  jobs.set(id,job);
}
function relevantContext(id,question,maxChars=18000){
  if(!validPlaylistId(id))return '';
  const s=get(id);
  if(!s.videos.length)return '(No playlist lessons indexed yet)';
  const words=new Set(String(question||'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);
  const heading='PLAYLIST: '+(s.title||id)+' ('+s.videos.filter(v=>v.segments?.length).length+'/'+s.videos.length+' transcripts indexed)\n'
    +s.videos.map((v,i)=>(i+1)+'. '+v.title+' ['+v.id+']'+(v.segments?.length?'':' [captions unavailable]')).join('\n');
  const chunks=[];
  for(let i=0;i<s.videos.length;i++){
    const v=s.videos[i],segments=v.segments||[];
    for(let n=0;n<segments.length;n+=35){
      const slice=segments.slice(n,n+35);
      const value=slice.map(x=>'['+Math.floor(x.start/60)+':'+String(Math.floor(x.start%60)).padStart(2,'0')+'] '+x.text).join('\n');
      const content=value.toLowerCase(),title=v.title.toLowerCase();
      let score=0;
      for(const w of words)if(content.includes(w))score+=2;if(words.size && [...words].some(w=>title.includes(w)))score+=2;
      chunks.push({score,order:i,offset:n,text:'Lesson '+(i+1)+' — '+v.title+' (https://www.youtube.com/watch?v='+v.id+'&list='+id+')\n'+value});
    }
  }
  chunks.sort((a,b)=>b.score-a.score||a.order-b.order||a.offset-b.offset);
  let remaining=Math.max(1000,maxChars-heading.length-60),selected=[];
  for(const c of chunks){
    if(remaining<500)break;
    const part=c.text.slice(0,Math.min(remaining,3300));selected.push(part);remaining-=part.length+4;
    if(selected.length>=8)break;
  }
  return (heading+'\n\nRELEVANT TIMESTAMPED EXCERPTS FROM OTHER PLAYLIST LESSONS:\n'+(selected.join('\n---\n')||'(No other lesson captions indexed yet)')).slice(0,maxChars);
}
module.exports={validPlaylistId,validVideoId,normalizedSegments,parseVtt,parseJson3,get,status,upsert,startIndexing,relevantContext};
