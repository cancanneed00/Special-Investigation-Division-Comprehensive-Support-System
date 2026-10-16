const {test}=require('node:test');
const assert=require('node:assert/strict');
const {OfficeInventory,decompositionConfirmed}=require('../lib/office-inventory');
const {corridorResult}=require('../lib/corridor-result');
const {sweepCorridor}=require('../lib/corridor');
const {Flow}=require('../lib/flow');
test('accept replenishment, reject unchanged, excess loss and missing readings',()=>{
 assert.ok(decompositionConfirmed(79,15,71,2));assert.ok(decompositionConfirmed(79,15,64,0));
 for(const [after,left] of [[79,15],[80,2],[63,0],[71,15],[71,null],[null,2]])assert.equal(decompositionConfirmed(79,15,after,left),false);
});
test('absent stack means zero only with complete inventory accounting',async()=>{
 let rows=[['机运护符-V',90],['库存：27',140],['生命护符-V',220],['杂点',250],['库存：37',270]];
 const office=new OfficeInventory({ocr:async()=>({detail:{all:rows.map(([text,y])=>({text,box:[775,y,100,25]}))}})});
 assert.equal(await office.remaining('勇气护符-V',64),0);assert.equal(await office.remaining('生命护符-V',64),37);
 assert.equal(await office.remaining('勇气护符-V',71),null);rows.splice(1,1);assert.equal(await office.remaining('勇气护符-V',64),null);
});
function clockVision(){let time=0;const v=new Flow({slowScale:1,performance:{pollMs:150,operationTimeoutMs:60000},check(){}});v.saveDiagnostic=()=>{};v.loading=async()=>false;const wait=v.wait.bind(v);v.wait=(probe,label,options)=>wait(probe,label,{...options,now:()=>time,pause:async ms=>{time+=ms;}});return v;}
test('last stack requires explicit empty inventory marker',async()=>{
 let empty=false;const office=new OfficeInventory({ocr:async pattern=>empty && pattern==='^暂无物品$'?{hit:true}:null});
 assert.equal(await office.remaining('勇气护符-V',0),null);empty=true;assert.equal(await office.remaining('勇气护符-V',0),0);
 assert.equal(decompositionConfirmed(2,2,0,0),true);
});
test('inventory confirmation requires two stable frames after unchanged frame',async()=>{
 let index=0;const office=new OfficeInventory(clockVision());office.count=async()=>[79,71,71][Math.min(index++,2)];office.remaining=async()=>2;
 await office.confirmDecomposition(79,15,'勇气护符-V');assert.equal(index,3);
});
function pageVision(markers){return {frame:async fn=>fn(),ocr:async pattern=>markers.some(text=>new RegExp(pattern).test(text))?{hit:true}:null};}
test('both result layouts accepted; partial labels and unknown pages rejected',async()=>{
 assert.equal(await corridorResult(pageVision(['探索完成'])),true);assert.equal(await corridorResult(pageVision(['完成关卡','获得星数','①得分'])),true);
 for(const labels of [[],['探索'],['完成关卡','获得星数'],['完成关卡','得分'],['获得星数','得分']])assert.equal(await corridorResult(pageVision(labels)),false);
});
test('two sweep result layouts lead to stamina exhaustion without duplicate departure',async()=>{
 let state='detail',round=0,departures=0,clicks=0;
 const v={frame:async fn=>fn(),ocr:async pattern=>{
 const labels={detail:['扫荡'],departure:['出发'],old:['探索完成'],alternate:['完成关卡','获得星数','得分'],stamina:['下次恢复时间']}[state];
 return labels.some(text=>new RegExp(pattern).test(text))?{hit:true}:null;
 },textStep:async(pattern,expected,label,roi,options)=>{
 assert.ok(await v.ocr(pattern));if(pattern==='^扫荡$')state=++round===3?'stamina':'departure';else{assert.equal(options.irreversible,true);departures++;state=round===1?'old':'alternate';}assert.ok(await expected());
 },blankUntil:async(guard,expected)=>{assert.ok(await guard());clicks++;state='detail';assert.ok(await expected());}};
 await sweepCorridor(v,{pause:async()=>{}});assert.equal(departures,2);assert.equal(clicks,3);
});
test('unknown result times out without blind blank clicks',async()=>{
 let clicks=0;const v=clockVision();v.ocr=async()=>null;v.reward=async()=>null;v.blank=async()=>{clicks++;};
 await assert.rejects(v.blankUntil(()=>corridorResult(v),async()=>false,'未知结算'),{code:'RESULT_TIMEOUT'});assert.equal(clicks,0);
});
