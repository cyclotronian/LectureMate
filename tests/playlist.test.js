process.env.LECTUREMATE_PLAYLIST_DIR=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'lm-tests-'));
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validPlaylistId,validVideoId,parseJson3,parseVtt,normalizedSegments,get,status,relevantContext}=require('../server/playlist-store');
test('validates playlist and video IDs rather than accepting URLs or file paths',()=>{
 assert.ok(validPlaylistId('PLoazKTcS0RzZ1SUgeOgc6SWt51gfT80N0'));
 assert.ok(validVideoId('DXBPtpBhGqo'));
 assert.equal(validPlaylistId('../../etc/passwd'),false);
 assert.equal(validVideoId('https://youtube.com'),false);
});
test('parses timed VTT and YouTube json3 captions',()=>{
 const vtt='WEBVTT\n\n00:00:02.000 --> 00:00:04.000\nA confounder affects treatment.\n\n00:00:05.000 --> 00:00:06.000\nAnd outcome.\n';
 assert.deepEqual(parseVtt(vtt),[{start:2,text:'A confounder affects treatment.'},{start:5,text:'And outcome.'}]);
 const json=JSON.stringify({events:[{tStartMs:2000,segs:[{utf8:'causal '},{utf8:'effect'}]},{tStartMs:4000,segs:[{utf8:'\n'}]}]});
 assert.deepEqual(parseJson3(json),[{start:2,text:'causal effect'}]);
});
test('deduplicates segments and selects later playlist lessons for relevant questions',()=>{
 const id='PLtestplaylist1234567';
 const s=get(id);
 s.title='Intro to causal inference';
 s.videos=[
  {id:'aaaAAA11122',title:'Lesson 1: Overview',segments:[{start:10,text:'Basic introduction to treatment.'}]},
  {id:'bbbBBB33344',title:'Lesson 2: Backdoor adjustment',segments:[{start:360,text:'Backdoor paths cause confounding and can be blocked by conditioning.'}]}
 ];
 const ctx=relevantContext(id,'How do I block a backdoor path?');
 assert.match(ctx,/Lesson 2: Backdoor adjustment/);
 assert.match(ctx,/Backdoor paths cause confounding/);
 assert.match(ctx,/www.youtube.com\/watch\?v=bbbBBB33344/);
 assert.equal(status(id).indexed,2);
 assert.deepEqual(normalizedSegments([{start:5,text:'hello'},{start:5,text:'hello'},{start:6,text:'hi'}]),[{start:5,text:'hello'},{start:6,text:'hi'}]);
});
