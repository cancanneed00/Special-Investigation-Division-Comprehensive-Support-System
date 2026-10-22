const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const corridor=require(path.join(ROOT,'lib/corridor'));
const notices=require(path.join(ROOT,'lib/run-notices'));
const VINYL=corridor.VINYL_ROI;
const VINYL_PATTERN='^\\d+\\s*[\\/／]\\s*\\d+$';
// run_stamina_clear 开跑即登记的关卡解锁前提提醒（自动刷取只支持已解锁关卡）。
const UNLOCK_NOTICE='清体力为自动刷取，仅支持已解锁的关卡；目标关卡未解锁将导致本次刷取失败，请先在游戏中确认关卡已全部解锁';
const noPause={pause:async()=>{}};
// 只回答黑胶计数 OCR 的假 Flow：其余识别一律不命中。
function vinylFlow(text,score=0.95){
 let reads=0;
 const v={ocr:async(pattern,roi)=>{
  if(pattern===VINYL_PATTERN){
   assert.deepEqual(roi,VINYL);reads++;
   if(text===null)return null;
   return {hit:true,detail:{best:{text,score,box:[90,610,90,40]}}};
  }
  return null;
 }};
 return {v,reads:()=>reads};
}
test('maxed vinyl cap is read after two consistent high-score reads',async()=>{
 const f=vinylFlow('480/480');
 assert.equal(await corridor.readVinylCap(f.v,noPause),480);
 assert.ok(f.reads()>=2);
});
test('unfilled vinyl cap value is returned for the gate to act on',async()=>{
 assert.equal(await corridor.readVinylCap(vinylFlow('0/480').v,noPause),0);
 assert.equal(await corridor.readVinylCap(vinylFlow('180/480').v,noPause),180);
});
test('full-width slash and spaced forms are accepted',async()=>{
 assert.equal(await corridor.readVinylCap(vinylFlow('480 ／ 480').v,noPause),480);
});
test('low-confidence reads are discarded and fall back to unknown',async()=>{
 assert.equal(await corridor.readVinylCap(vinylFlow('0/480',0.5).v,noPause),null);
 assert.equal(await corridor.readVinylCap(vinylFlow(null).v,noPause),null);
});
test('unexpected cap denominator is treated as unknown, never as unfilled',async()=>{
 assert.equal(await corridor.readVinylCap(vinylFlow('200/500').v,noPause),null);
});
// 用假 Flow 模块加载 run_stamina_clear，验证门控接线。
// 调用方负责先给 corridor.sweepCorridor 打桩并最终还原。
function loadStaminaClear({vinyl,homeReturns,captured}){
 const flowPath=require.resolve(path.join(ROOT,'lib/flow'));
 const realFlow=require.cache[flowPath];
 const runPath=require.resolve(path.join(ROOT,'run_stamina_clear.js'));
 class FakeFlow{
  homeButton(){return {hit:true};}
  async ocr(pattern){
   if(pattern===VINYL_PATTERN)return vinyl===null?null:{hit:true,detail:{best:{text:vinyl,score:0.95,box:[90,610,90,40]}}};
   return {hit:true,detail:{best:{text:'回廊42区',score:0.99}}};
  }
  async step(){return true;}
  async textStep(){return true;}
  async wait(probe){const result=await probe();if(!result)throw new Error('wait failed');return result;}
  async homeReturn(){homeReturns.push('homeReturn');}
  async capture(){captured.push('capture');}
 }
 require.cache[flowPath]={id:flowPath,filename:flowPath,loaded:true,exports:{Flow:FakeFlow,sleep:async()=>{}}};
 const {run}=require(runPath);
 delete require.cache[runPath];
 require.cache[flowPath]=realFlow;
 return run;
}
async function withSweptStub(body){
 const swept=[];const original=corridor.sweepCorridor;
 corridor.sweepCorridor=async()=>{swept.push('swept');};
 try{await body(swept);}finally{corridor.sweepCorridor=original;}
 return swept;
}
test('unfilled cap skips red-coin sweep, returns home and registers the reminder',async()=>{
 const homeReturns=[],captured=[];
 await withSweptStub(async swept=>{
  const run=loadStaminaClear({vinyl:'0/480',homeReturns,captured});
  notices.takeNotices();
  await run({});
  assert.deepEqual(swept,[]);
 });
 assert.deepEqual(homeReturns,['homeReturn']);
 assert.deepEqual(captured,[]);
 assert.deepEqual(notices.takeNotices(),[UNLOCK_NOTICE,'黑胶上限 0/480 未满，本轮已跳过红币扫荡；黑胶有获取上限、先刷满更划算，请在回廊刷黑胶至 480/480 后重跑清体力']);
});
test('full cap proceeds to sweep and finishes normally',async()=>{
 const homeReturns=[],captured=[];
 const swept=await withSweptStub(async()=>{
  const run=loadStaminaClear({vinyl:'480/480',homeReturns,captured});
  notices.takeNotices();
  await run({});
 });
 assert.deepEqual(swept,['swept']);
 assert.deepEqual(homeReturns,['homeReturn']);
 assert.deepEqual(captured,['capture']);
 assert.deepEqual(notices.takeNotices(),[UNLOCK_NOTICE]);
});
test('unknown cap reading keeps the existing sweep behavior',async()=>{
 const homeReturns=[],captured=[];
 const swept=await withSweptStub(async()=>{
  const run=loadStaminaClear({vinyl:null,homeReturns,captured});
  notices.takeNotices();
  await run({});
 });
 assert.deepEqual(swept,['swept']);
 assert.deepEqual(notices.takeNotices(),[UNLOCK_NOTICE]);
});
