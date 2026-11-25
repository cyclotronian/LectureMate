const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseTime,readRows,showButton} = require('../extension/transcript.js');
function row(time,text,legacy=false){
  return {querySelector(selector){
    const names=selector.split(',').map(x=>x.trim());
    const matches=(legacy?'.segment-timestamp':'.ytwTranscriptSegmentViewModelTimestamp');
    const body=(legacy?'.segment-text':'span[role="text"]');
    if(names.includes(matches)) return {textContent:time};
    if(names.includes(body)) return {textContent:text};
    return null;
  }};
}
test('parses YouTube transcript timestamps, rejects non-timestamps',()=>{
  assert.equal(parseTime('00:09'),9);
  assert.equal(parseTime('01:02:03'),3723);
  assert.equal(parseTime(' 12:34 '),754);
  assert.equal(parseTime('1:75'),null);
  assert.equal(parseTime('Show transcript'),null);
});
test('reads both modern 2026 and classic YouTube transcript rows',()=>{
  const doc={querySelectorAll(){return [row('0:06','What is causal inference?'),row('0:13','Treatment effects',true),row('0:06','What is causal inference?'),row('bad','garbage')];}};
  assert.deepEqual(readRows(doc),[{start:6,text:'What is causal inference?'},{start:13,text:'Treatment effects'}]);
});
test('locates the transcript trigger and avoids LectureMate buttons',()=>{
  const trigger={};
  const doc={querySelector:()=>trigger,querySelectorAll:()=>[]};
  assert.equal(showButton(doc),trigger);
  const ignored={closest:()=>true,getAttribute:()=>null,textContent:'Show transcript'};
  const valid={closest:()=>null,getAttribute:()=>null,textContent:'Show transcript'};
  assert.equal(showButton({querySelector:()=>null,querySelectorAll:()=>[ignored,valid]}),valid);
});
