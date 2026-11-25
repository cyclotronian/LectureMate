const {test}=require('node:test');
const assert=require('node:assert/strict');
const {stagesFor,createPlayer}=require('../extension/teacher-playback');
const A={type:'dag',title:'Confounding',latex:'',nodes:[{id:'Z',label:'Confounder',x:.5,y:.2}],edges:[]};
const B={type:'dag',title:'Confounding',latex:'',nodes:[{id:'Z',label:'Confounder',x:.5,y:.2},{id:'X',label:'Treatment',x:.2,y:.8}],edges:[{from:'Z',to:'X',label:''}]};
test('prepares staged voice script and preserves complete per-stage visual frames',()=>{
 const msg={spoken:'Full version',visual:B,teachingSteps:[{spoken:'Here is Z.',visual:A},{spoken:'Now treatment.',visual:B}]};
 const steps=stagesFor(msg);
 assert.equal(steps.length,2);
 assert.equal(steps[0].spoken,'Here is Z.');
 assert.equal(steps[0].visual.nodes.length,1);
 assert.equal(steps[1].visual.edges.length,1);
});
test('falls back to one stage for older saved replies',()=>{
 const msg={spoken:'An older answer',visual:B};
 assert.deepEqual(stagesFor(msg),[{spoken:'An older answer',visual:B}]);
 assert.deepEqual(stagesFor({spoken:''}),[]);
});
test('narrates one storyboard step at a time and restores the final diagram',()=>{
 const said=[],events=[],frames=[];
 const fake={cancel(){},speak(utterance){said.push(utterance)},getVoices(){return [{lang:'en-US'}]}};
 class Utterance{constructor(text){this.text=text}}
 const player=createPlayer({synth:fake,Utterance,onFrame:(visual,n,total,done)=>frames.push({visual,n,total,done}),onChange:(msg,playing)=>events.push(playing)});
 const msg={spoken:'Final',visual:B,teachingSteps:[{spoken:'First',visual:A},{spoken:'Second',visual:B}]};
 assert.equal(player.play(msg),true);
 assert.equal(said[0].text,'First');assert.equal(frames[0].visual.nodes.length,1);
 said[0].onend();
 assert.equal(said[1].text,'Second');assert.equal(frames[1].visual.nodes.length,2);
 said[1].onend();
 assert.equal(player.isPlaying(msg),false);
 assert.equal(frames.at(-1).done,true);
 assert.deepEqual(events,[true,true,true,false]);
});
test('stopping narration cancels remaining stages',()=>{
 let canceled=0;const said=[];
 class Utterance{constructor(text){this.text=text}}
 const fake={cancel(){canceled++},speak(x){said.push(x)},getVoices(){return []}};
 const player=createPlayer({synth:fake,Utterance});
 const msg={spoken:'All',visual:B,teachingSteps:[{spoken:'1',visual:A},{spoken:'2',visual:B}]};
 player.play(msg);player.stop();said[0].onend();
 assert.equal(said.length,1);
 assert.equal(player.isPlaying(msg),false);
 assert.ok(canceled>=1);
});
