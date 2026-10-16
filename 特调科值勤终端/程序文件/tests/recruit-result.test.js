const {test}=require('node:test'),assert=require('node:assert/strict');const {Vision}=require('../lib/vision');const {finishRecruitResult}=require('../lib/recruit-result');
function fixture(){let time=0;const v=new Vision({performance:{pollMs:150,operationTimeoutMs:60000},slowScale:1,check(){}});v.saveDiagnostic=()=>{};const wait=v.wait.bind(v);const options={now:()=>time,pause:async ms=>{time+=ms;}};v.wait=(p,l,o)=>wait(p,l,{...o,...options});return {v,options,advance:ms=>{time+=ms;},time:()=>time};}
test('transient reward title and late button require two simultaneous frames even in nested wait',async()=>{
 const f=fixture();let frame=0,clicks=0,templateCalls=0;f.v.invalidate=()=>{frame++;};
 f.v.reward=async()=>frame!==1;f.v.template=async()=>{templateCalls++;return frame>=3?{detail:{best:{box:[600,600,80,50]}}}:null;};
 f.v.click=async()=>{clicks++;assert.equal(frame,4);};
 await f.v.frame(()=>f.v.rewardClick());assert.equal(clicks,1);assert.equal(frame,4);assert.equal(templateCalls,5);
});
test('button without reward title never authorizes click',async()=>{
 const f=fixture();let calls=0;f.v.reward=async()=>false;f.v.template=async()=>{calls++;return {};};f.v.click=async()=>assert.fail('unsafe click');
 await assert.rejects(f.v.rewardClick(),{code:'RESULT_TIMEOUT'});assert.equal(calls,0);
});
test('reward title without button times out without click',async()=>{
 const f=fixture();f.v.reward=async()=>true;f.v.template=async()=>null;f.v.click=async()=>assert.fail('unsafe click');await assert.rejects(f.v.rewardClick(),{code:'RESULT_TIMEOUT'});
});
test('slow 15-second OCR permits reward then two confirmed external-page frames',async()=>{
 const f=fixture();let checks=0,pages=0,clicks=0;f.v.reward=async()=>{f.advance(15000);return ++checks===1;};f.v.rewardClick=async()=>{clicks++;};f.v.home=async()=>false;
 await finishRecruitResult(f.v,async()=>{pages++;f.advance(15000);return true;},f.options);assert.equal(clicks,1);assert.equal(pages,2);assert.ok(f.time()>45000);
});
test('external page without observed reward cannot be reported as successful',async()=>{
 const f=fixture();f.v.reward=async()=>false;f.v.click=async()=>assert.fail('must not recruit again');await assert.rejects(finishRecruitResult(f.v,async()=>true,{...f.options,maxSteps:200}),{code:'RESULT_TIMEOUT'});
});
test('result flow respects stop request',async()=>{
 const f=fixture();f.v.s.check=()=>{throw Error('用户已停止任务');};await assert.rejects(finishRecruitResult(f.v,async()=>false,f.options),/用户已停止任务/);
});
