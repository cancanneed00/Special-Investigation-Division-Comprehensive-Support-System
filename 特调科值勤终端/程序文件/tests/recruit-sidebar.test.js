const {test}=require('node:test');const assert=require('node:assert/strict');
const {Flow}=require('../lib/flow');const {enterExternal,occupiedSlots,SIDEBAR}=require('../lib/recruit-sidebar');
function fixture({y=280,hidden=0,missing=false,unknown=false,failSwipe=false}={}){
 let swipes=0,clicks=0,entered=false,invalidations=0;const directions=[];
 const v=new Flow({check(){},operation:async(label,fn)=>fn(),controller:{post_swipe(x,a,xx,b){swipes++;directions.push(b<a?'down':'up');return {wait:async()=>({succeeded:!failSwipe})};}}});
 v.ocr=async(pattern,roi)=>{
  if(unknown)return null;
  if(pattern==='.*招募.*')return {hit:true};
  if(pattern==='.*外部招募.*'&&!missing&&swipes>=hidden){assert.deepEqual(roi,SIDEBAR);return {detail:{best:{text:'外部招募',box:[80,y,86,28]}}};}
  return null;
 };v.template=async()=>unknown?null:{hit:true};v.loading=async()=>false;v.invalidate=()=>invalidations++;
 v.wait=async probe=>{const result=await probe();if(!result){const e=Error('not found');e.code='RESULT_TIMEOUT';throw e;}return result;};
 v.click=async reco=>{assert.equal(reco.detail.best.text,'外部招募');clicks++;entered=true;};
 return {v,marker:async()=>entered,stats:()=>({swipes,clicks,invalidations,directions}),enter:()=>{entered=true;}};
}
test('removed preceding pool: upper external entry is clicked once without scrolling',async()=>{
 const f=fixture();await enterExternal(f.v,f.marker,{pause:async()=>{}});assert.equal(f.stats().clicks,1);assert.equal(f.stats().swipes,0);
});
test('visible bottom entry does not trigger unnecessary scroll',async()=>{
 const f=fixture({y:610});await enterExternal(f.v,f.marker,{pause:async()=>{}});assert.equal(f.stats().clicks,1);assert.equal(f.stats().swipes,0);
});
test('offscreen entry is found by scrolling downward then fresh recognition',async()=>{
 const f=fixture({hidden:2,y:500});await enterExternal(f.v,f.marker,{pause:async()=>{}});assert.deepEqual(f.stats().directions,['down','down']);assert.equal(f.stats().clicks,1);assert.equal(f.stats().invalidations,2);
});
test('saved scroll offset can be searched in reverse',async()=>{
 const f=fixture({hidden:4});await enterExternal(f.v,f.marker,{pause:async()=>{}});assert.deepEqual(f.stats().directions,['down','down','down','up']);assert.equal(f.stats().clicks,1);
});
test('missing external entry is bounded and never clicks another pool',async()=>{
 const f=fixture({missing:true});await assert.rejects(enterExternal(f.v,f.marker,{pause:async()=>{}}),/双向查找/);assert.equal(f.stats().swipes,9);assert.equal(f.stats().clicks,0);
});
test('failed swipe and cancellation stop before selecting pool',async()=>{
 const f=fixture({hidden:2,failSwipe:true});await assert.rejects(enterExternal(f.v,f.marker,{pause:async()=>{}}),/滑动失败/);assert.equal(f.stats().clicks,0);
 const g=fixture({hidden:2});g.v.s.check=()=>{throw Error('用户已停止');};await assert.rejects(enterExternal(g.v,g.marker),/用户已停止/);assert.equal(g.stats().swipes,0);
});
test('already on external page bypasses list navigation',async()=>{
 const f=fixture();f.enter();await enterExternal(f.v,f.marker);assert.equal(f.stats().clicks,0);assert.equal(f.stats().swipes,0);
});
test('slot badge region follows external label for upper and lower layouts',async()=>{
 for(const y of [278,610]){
  const f=fixture({y});const original=f.v.ocr;f.v.ocr=async(pattern,roi)=>{
   if(pattern==='^[0-4][/／]4$'){assert.deepEqual(roi,[30,y-85,195,120]);return {detail:{best:{text:'2/4'}}};}return original(pattern,roi);
  };assert.equal(await occupiedSlots(f.v),2);
 }
 const f=fixture({missing:true});assert.equal(await occupiedSlots(f.v),null);
});
