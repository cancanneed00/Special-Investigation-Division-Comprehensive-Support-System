const {test}=require('node:test');const assert=require('node:assert/strict');
const {Flow}=require('../lib/flow');

function fixture(){
 const calls={retryClicks:0,points:[]};
 const v=new Flow({check(){},operation:async(label,fn)=>fn(),controller:{post_click(x,y){calls.retryClicks++;calls.points.push([x,y]);return {wait:async()=>({succeeded:true})};}}});
 v.invalidate=()=>{};
 return {v,calls};
}

test('connectionGuard passes confirmed result through without dialog handling',async()=>{
 const {v,calls}=fixture();
 let expectedCalls=0;
 const wrapped=v.connectionGuard(async()=>{expectedCalls++;return {ok:true};});
 assert.deepEqual(await wrapped(),{ok:true});
 assert.equal(expectedCalls,1);assert.equal(calls.retryClicks,0);
});

test('connectionGuard clicks the retry check when the dialog appears',async()=>{
 const {v,calls}=fixture();
 v.ocr=async(pattern,roi)=>{
  if(pattern==='.*连接未成功.*'){assert.deepEqual(roi,[400,250,480,80]);return {detail:{best:{text:'连接未成功，请点击确定重试'}}};}
  return null;
 };
 const wrapped=v.connectionGuard(async()=>null);
 assert.equal(await wrapped(),null);
 assert.equal(calls.retryClicks,1);assert.deepEqual(calls.points,[[700,370]]);
});

test('connectionGuard stays silent when no dialog is present',async()=>{
 const {v,calls}=fixture();
 v.ocr=async()=>null;
 const wrapped=v.connectionGuard(async()=>null);
 assert.equal(await wrapped(),null);
 assert.equal(calls.retryClicks,0);
});

test('step keeps confirming a claim across a transient connection failure',async()=>{
 const {v,calls}=fixture();
 let rewardHits=0;
 v.ocr=async(pattern)=>{
  if(pattern==='.*获取物资.*'){rewardHits++;return rewardHits>=2?{detail:{best:{text:'获取物资'}}}:null;}
  if(pattern==='.*连接未成功.*')return rewardHits<2?{detail:{best:{text:'连接未成功，请点击确定重试'}}}:null;
  return null;
 };
 v.loading=async()=>false;
 let probes=0;
 const probe=async()=>++probes===1?{detail:{best:{box:[1114,657,86,25]}}}:null;
 v.click=async()=>{};
 v.wait=async(p,label,{stable=2}={})=>{
  let n=0;
  for(let i=0;i<50;i++){const r=await p();n=r?n+1:0;if(n>=stable)return r;}
  const e=Error('结果未确认：'+label);e.code='RESULT_TIMEOUT';throw e;
 };
 const result=await v.step(probe,()=>v.ocr('.*获取物资.*'),'日常全部领取',{irreversible:true});
 assert.ok(result);
 assert.equal(calls.retryClicks,1);
});
