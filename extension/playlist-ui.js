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
