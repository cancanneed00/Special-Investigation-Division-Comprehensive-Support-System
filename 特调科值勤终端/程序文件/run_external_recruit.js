const {enterExternal,occupiedSlots}=require('./lib/recruit-sidebar');
const {Flow,integer} = require('./lib/flow');
const {finishRecruitResult}=require('./lib/recruit-result');
async function run(session) {
 const v=new Flow(session);
 const marker=()=>v.ocr('^(启动招募|招募成功|任务已满)$',[800,400,480,320]);
 await enterExternal(v,marker);
 for(let round=0;round<12;round++) {
  const state=await v.wait(marker,'招募状态',{timeout:15000});
  const text=state.detail.best.text;
  if(text==='任务已满'){await v.homeReturn();return;}
  if(text==='招募成功') {
   await v.step(marker,async()=>await v.reward() || !await marker(),'领取招募结果',{irreversible:true});
   await finishRecruitResult(v,marker,{animationAllowed:true,timeout:15000});
  } else {
   const occupied=await occupiedSlots(v);
   if(!Number.isInteger(occupied)||occupied<0||occupied>=4)throw new Error('无法确认空闲招募槽数量');
   const modal=()=>v.ocr('单次耗时.*分钟',[400,180,500,160]);
   await v.textStep('^启动招募$',modal,'打开招募数量',[800,400,480,320]);
   const count=async()=>integer(await v.ocr('^[0-9]+$',[600,345,80,55]));
   // MAX is idempotent; verify a stable selected count, then require 任务已满 after confirmation.
   await v.step(()=>v.template('招募数量_MAX.png',[690,260,260,210],0.76),async()=>{
    const a=await count();return a===4-occupied && a===await count();
   },'选择招募 MAX');
   await v.textStep('^确定$',()=>v.ocr('^任务已满$',[800,400,480,320]),'确认招募并检查任务已满',[560,400,360,190],{irreversible:true});
  }
 }
 throw new Error('招募循环达到保护上限');
}
module.exports={run};
