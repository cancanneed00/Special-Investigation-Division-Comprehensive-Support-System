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
test('occupied slots count follows in-progress markers, then badge fallback',async()=>{
 // 主检测：右侧面板按“招募中”次数统计占用槽位（与侧栏布局无关）。
 const a=fixture();const oa=a.v.ocr;a.v.ocr=async(pattern,roi)=>{
  if(pattern==='.*'){assert.deepEqual(roi,[900,40,380,560]);return {detail:{all:[{text:'招募中'},{text:'空闲'},{text:'空闲'},{text:'空闲'}]}};}
  return oa(pattern,roi);
 };assert.equal(await occupiedSlots(a.v),1);
 // 面板读空但徽标可用：走兜底（左栏“N/4”，放宽到左边缘与标签上下带）。
 const b=fixture({y:610});const ob=b.v.ocr;b.v.ocr=async(pattern,roi)=>{
  if(pattern==='.*'){return {detail:{all:[]}};}
  if(pattern==='^[0-4][/／]4$'){assert.deepEqual(roi,[0,520,200,150]);return {detail:{best:{text:'3/4'}}};}
  return ob(pattern,roi);
 };assert.equal(await occupiedSlots(b.v),3);
 // 面板与徽标都读不到：返回 null。
 const c=fixture({missing:true,unknown:true});assert.equal(await occupiedSlots(c.v),null);
});
