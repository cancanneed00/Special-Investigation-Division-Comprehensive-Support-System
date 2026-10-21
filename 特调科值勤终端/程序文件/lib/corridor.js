const {sleep}=require('./flow');
const {corridorResult}=require('./corridor-result');
// 回廊关卡页左下角的「黑胶上限 X/480」计数（游戏后台捕获恒归一化到 1280×720，坐标各机器一致）。
// 区块内还有唱片图标、「黑胶上限」标签和「剩余N天」角标，用数字/数字的 Pattern 只取计数本身，
// 其余文字不会被匹配；全角斜杠与带空格写法都接受。
const VINYL_ROI=[10,540,260,170];
// 可靠读取黑胶上限当前值：丢弃低置信度读数，需两次一致高分才采信；
// 读不出、或上限本身不是 480（游戏改动）时返回 null，按未知处理继续原流程，绝不贸然跳过。
async function readVinylCap(v,{pause=sleep}={}) {
 const seen=new Map();
 for(let attempt=0;attempt<8;attempt++){
  const reco=await v.ocr('^\\d+\\s*[\\/／]\\s*\\d+$',VINYL_ROI);
  const best=reco&&reco.detail&&reco.detail.best;
  if(best&&best.score>=0.85){
   const m=String(best.text||'').match(/(\d+)\s*[\/／]\s*(\d+)/);
   if(m&&Number(m[2])===480){
    const value=Number(m[1]);
    if(Number.isInteger(value)){
     const hits=(seen.get(value)||0)+1;seen.set(value,hits);
     if(hits>=2){console.log(`黑胶上限当前值 ${value}/480`);return value;}
    }
   }
  }
  await pause(400);
 }
 console.log('黑胶上限读数不确定，按未知处理继续红币刷取');
 return null;
}
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
module.exports={sweepCorridor,readVinylCap,VINYL_ROI};
