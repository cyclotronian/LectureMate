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
