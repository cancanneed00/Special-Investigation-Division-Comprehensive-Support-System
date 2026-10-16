const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Vision}=require('../lib/vision');
const {finishCard}=require('../lib/office-progress');
const {observe,recoveryBudget}=require('../lib/performance');
function fixture(){
 let time=0,frames=0,blanks=0;
 const s={slowScale:1,performance:{pollMs:150,operationTimeoutMs:60000},check(){}};
 const v=new Vision(s);v.saveDiagnostic=()=>{};v.loading=async()=>false;
 v.loading=async()=>{frames++;time+=1000;return false;};v.reward=async()=>{time+=2000;return false;};
 v.blank=async()=>{blanks++;};
 const office={v,archive:async()=>{time+=8000;return true;},firstCard:async()=>{time+=8000;return true;},empty:async()=>false,candidatePage:async()=>false};
 return {office,v,s,options:{now:()=>time,pause:async ms=>{time+=ms;}},state:()=>({time,frames,blanks}),advance:ms=>{time+=ms;}};
}
test('office completion accepts two slow confirmed frames beyond old 30s limit',async()=>{
 const f=fixture();await finishCard(f.office,f.options);
 assert.equal(f.state().frames,2);assert.ok(f.state().time>30000);assert.equal(f.state().blanks,0);
});
test('candidate page timeout never repeats ritual or blank-clicks',async()=>{
 const f=fixture();f.office.archive=async()=>{f.advance(10000);return false;};f.office.candidatePage=async()=>true;
 await assert.rejects(finishCard(f.office,f.options),{code:'RESULT_TIMEOUT'});
 assert.equal(f.state().blanks,0);assert.ok(f.state().time<400000);
});
test('reward interruption resets stable office confirmation',async()=>{
 const f=fixture();let rewards=0;
 f.v.reward=async()=>f.state().frames===2;
 f.v.rewardClick=async()=>{rewards++;};
 await finishCard(f.office,f.options);
 assert.equal(f.state().frames,4);assert.equal(rewards,1);
});
test('unknown transition keeps explicit twenty-click cap',async()=>{
 const f=fixture();f.v.loading=async()=>false;f.v.reward=async()=>false;f.office.archive=async()=>false;
 await assert.rejects(finishCard(f.office,f.options),/保护上限/);assert.equal(f.state().blanks,20);
});
test('office empty page can complete without selecting another card',async()=>{
 const f=fixture();f.office.firstCard=async()=>false;f.office.empty=async()=>true;
 await finishCard(f.office,f.options);assert.equal(f.state().frames,2);assert.equal(f.state().blanks,0);
});
test('recovery keeps observed slow-machine budget after fast probes; remains capped',()=>{
 const s={performance:{mode:'balanced'}};observe(s,19000);
 for(let i=0;i<7;i++)observe(s,100);
 assert.equal(s.slowScale,1);assert.equal(recoveryBudget(s),480000);
 assert.equal(recoveryBudget({}),120000);assert.equal(recoveryBudget({peakSlowScale:100}),480000);
});
test('archive marker tolerates the observed missing glyph, not arbitrary counters',async()=>{
 const {OfficeFlow}=require('../lib/office-flow');let expression,roi;
 const office=new OfficeFlow({ocr:(pattern,region)=>{expression=pattern;roi=region;return null;}});
 await office.count();const re=new RegExp(expression);
 assert.ok(re.test('已积累的档案残片9/12'));assert.ok(re.test('已积累的档案残9/12'));
 assert.equal(re.test('钥匙9/12'),false);assert.equal(re.test('已积累的档案残片9/120'),false);
 assert.deepEqual(roi,[40,505,260,45]);
});
test('office recovery refuses unknown pages and pending ritual candidates',async()=>{
 const {recoverArchive}=require('../lib/office-flow');let candidate=false;
 const v={frame:async fn=>fn(),ocr:async pattern=>{
  if(!candidate)return null;
  return pattern.startsWith('^已积累')||pattern==='^开始仪式$'?{hit:true}:null;
 },recognize:async()=>({hit:true}),back:async()=>assert.fail('must not navigate'),reward:async()=>null};
 assert.equal(await recoverArchive(v),false);candidate=true;assert.equal(await recoverArchive(v),false);
});
test('blankUntil uses two confirmed frames and does not click an absent dialog',async()=>{
 const {Flow}=require('../lib/flow');const v=new Flow({performance:{pollMs:150},slowScale:1,check(){}});
 v.saveDiagnostic=()=>{};v.loading=async()=>false;v.reward=async()=>null;v.blank=async()=>assert.fail('must not click');
 let confirmations=0;
 await v.blankUntil(async()=>false,async()=>{confirmations++;return true;},'closed');
 assert.equal(confirmations,2);
});
