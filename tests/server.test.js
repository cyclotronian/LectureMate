process.env.OPENAI_API_KEY = 'test-not-real';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {requestOpenAI,relevantParts,nearCaptions,makeContext,isAllowedOrigin,timeLabel,server}=require('../server/server.js');
test('formats video time',()=>{assert.equal(timeLabel(75),'00:01:15');assert.equal(timeLabel(3666),'01:01:06');});
test('can select relevant future-course paragraphs',()=>{
  const text=('introductory material confounding '.repeat(300))+'\n'+('later lesson: backdoor adjustment and causal graph '.repeat(300));
  const result=relevantParts(text,'How does backdoor adjustment work?',4200);
  assert.ok(result.includes('backdoor adjustment'));
});
test('uses captions near question timestamp',()=>{
  const arr=[{start:10,text:'early'},{start:520,text:'relevant'},{start:5000,text:'far'}];
  assert.match(nearCaptions(arr,520),/relevant/);
  assert.doesNotMatch(nearCaptions(arr,520),/far/);
});
test('includes course context even for future topics',()=>{
  const ctx=makeContext({question:'backdoor',courseNotes:'Future lesson: backdoor criterion',video:{title:'Intro',time:20,transcript:[]}});
  assert.match(ctx,/Future lesson: backdoor criterion/);
});
test('blocks ordinary web origins from local proxy',()=>{
  assert.equal(isAllowedOrigin('https://youtube.com'),false);
  assert.equal(isAllowedOrigin('chrome-extension://abc'),true);
  assert.equal(isAllowedOrigin('safari-web-extension://abc'),true);
});
test('local health server replies without leaking key',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const addr=server.address();
    const r=await fetch(`http://127.0.0.1:${addr.port}/health`);
    assert.equal(r.status,200);const body=await r.json();assert.equal(body.ok,true);assert.equal(typeof body.configured,'boolean');
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('model request preserves the latest question, full lecture and future-course context',async()=>{
  const oldFetch=global.fetch;
  let requested;
  global.fetch=async (url,opts)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    requested=JSON.parse(opts.body);
    return {ok:true,status:200,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'Backdoor blocking!',spoken:'Block the backdoor path.',visual:{type:'none',title:'',latex:'',nodes:[],edges:[]}})}]}]})};
  };
  try {
    const response=await requestOpenAI({question:'How do we block backdoor paths?',
      video:{title:'Causal course',time:812,transcript:[{start:810,text:'A confounder is a common cause.'}]},
      courseNotes:'Later topic: adjustment sets and d-separation',
      history:[{role:'user',text:'What is confounding?'},{role:'assistant',text:'A common cause.'}]});
    assert.equal(response.answer,'Backdoor blocking!');
    assert.equal(response.spoken,'Block the backdoor path.');
    const last=requested.input.at(-1).content;
    assert.match(last,/STUDENT QUESTION: How do we block backdoor paths/);
    assert.match(last,/A confounder is a common cause/);
    assert.match(last,/Later topic: adjustment sets and d-separation/);
    assert.equal(requested.text.format.type,'json_schema');
    assert.equal(requested.input.length,3);
  } finally {global.fetch=oldFetch;}
});
