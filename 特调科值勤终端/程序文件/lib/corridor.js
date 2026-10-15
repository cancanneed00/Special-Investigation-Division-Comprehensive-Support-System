const {sleep}=require('./flow');
const {corridorResult}=require('./corridor-result');
async function sweepCorridor(v,{maxRounds=100,pause=sleep}={}) {
 const detail=async()=>!await stamina()&&!await corridorResult(v)&&!await v.ocr('^出发$',[650,450,420,180])&&await v.ocr('^扫荡$',[850,570,300,150]);
 const stamina=()=>v.ocr('^下次恢复时间$',[350,0,700,220]);
 for(let round=1;round<=maxRounds;round++){
  await v.textStep('^扫荡$',async()=>await stamina()||await v.ocr('^出发$',[650,450,420,180]),`第${round}次扫荡`,[850,570,300,150]);
  if(await stamina()){
   await v.blankUntil(stamina,detail,'关闭体力不足弹窗',{x:0.93,y:0.72});
   return;
  }
  await v.textStep('^出发$',()=>corridorResult(v),'扫荡出发',[650,450,420,180],{irreversible:true});
  // click() already waits 500 ms; result recognition gates all blank clicks.
  await v.blankUntil(()=>corridorResult(v),detail,'关闭探索完成',{x:0.90,y:0.60});
  console.log(`第${round}次扫荡完成，继续检查剩余体力`);
  await pause(100);
 }
 throw new Error('回廊扫荡达到保护上限，尚未确认体力不足');
}
module.exports={sweepCorridor};
