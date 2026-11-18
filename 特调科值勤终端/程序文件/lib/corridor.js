const {sleep}=require('./flow');
const {corridorResult}=require('./corridor-result');
const {dismissLevelUp,hasPowerDialog,cancelPowerDialog}=require('./dismiss-popup');
// 回廊关卡页左下角的「黑胶上限 X/480」计数（游戏后台捕获恒归一化到 1280×720，坐标各机器一致）。
// 区块内还有唱片图标、「黑胶上限」标签和「剩余N天」角标，用数字/数字的 Pattern 只取计数本身，
// 其余文字不会被匹配；全角斜杠与带空格写法都接受。
const VINYL_ROI=[10,540,260,170];
// 2026-11-18 游戏改版：扫荡改用「快速完成」弹窗，次数由横向黄条控制。
// 黄条到头即当前可扫最大值（最多 5 次）；未到头时点黄条右侧（加号左边）的空白可一键拉满。
// 只剩 1 次时游戏会把滑块画在最左端、黄条永远不到头，这是正常状态，直接出发即可。
// 右侧滑块白色像素数：1 次≈60，2/3 次≈490~640；阈值 300 留出上下余量。
const QUICK_END_ROI=[900,420,75,80];
const QUICK_END_MIN=300;
const QUICK_BAR_POINT=[944/1280,459/720];
const QUICK_COUNT_ROI=[600,345,320,70];
// 2026-11-18 实测：扫荡多次后会先弹「快速完成结果」结算页（标题 + 完成次数N + 右下确定），
// 必须点「确定」才回到回廊关卡页；只扫荡 1 次时仍是原来的「探索完成」界面，走原流程。
// 实测 OCR：「快速完成结果」0.999 box[360,84,283,54]、「完成次数5」0.998 box[1087,581,101,27]、
// 「确定」1.000 box[1067,663,53,30]（中心≈1094,678）。
const QUICK_RESULT_TITLE_ROI=[300,60,420,110];
const QUICK_RESULT_COUNT_ROI=[1050,565,200,60];
const QUICK_OK_ROI=[980,630,300,90];
const QUICK_OK_POINT=[1094/1280,678/720];
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
// 读取「快速完成次数 N 次」；读不到返回 null（视为旧版弹窗或弹窗未就绪，保持原流程）。
async function quickCount(v){
 const reco=await v.ocr('.*快速完成次数\\s*\\d+\\s*次.*',QUICK_COUNT_ROI);
 const text=reco?.detail?.best?.text||'';
 const matched=text.match(/(\d+)\s*次/);
 return matched?Number(matched[1]):null;
}
// 黄条是否到头：只看滑条右侧滑块区的白色像素量。到头时滑块停在最右端（2/3 次也成立），
// 未到头时滑块在左侧，该区域只剩轨道装饰（1 次≈60）。
async function quickBarAtEnd(v){
 try{
  const reco=await v.recognize('ColorMatch',{roi:QUICK_END_ROI,method:4,lower:[160,155,135],upper:[255,255,255],count:20,connected:true,order_by:'Horizontal'});
  const all=reco?.detail?.all||[];
  return all.reduce((sum,item)=>sum+(item.count||0),0)>=QUICK_END_MIN;
 }catch(error){
  console.log('黄条到头检测失败，按未到头处理：'+error.message);
  return false;
 }
}
// 把快速完成次数拉到最大。必须先在头才允许点：已在最右端时再点会把 5 次降成 4 次。
// 1 次时仍点一次（可能只是默认值）；点完若仍是 1 次，说明可用上限就是 1，黄条不会到头，
// 直接出发，绝不死等“到头”。
async function fillQuickCount(v){
 const count=await quickCount(v);
 if(count===null){
  // 弹窗是「快速完成」但次数读不出：绝不能贸然点「出发」——体力不足时游戏会拿
  // 玩家的行动力道具自动补（不可逆）。点「取消」退出本轮，等体力恢复再扫。
  if(await v.ocr('^快速完成$',[150,80,320,70])){
   console.log('快速完成次数未识别（弹窗异常），点取消退出本轮，避免误耗行动力道具');
   await cancelPowerDialog(v);
   return 'cancelled';
  }
  console.log('快速完成次数未识别（可能不是新版弹窗），保持原流程');
  return;
 }
 if(count>=5){console.log(`快速完成：${count} 次，已达最大，直接出发`);return;}
 if(await quickBarAtEnd(v)){console.log(`快速完成：${count} 次，黄条已到头，直接出发`);return;}
 const [width,height]=v.size||[1280,720];
 const x=Math.round(width*QUICK_BAR_POINT[0]);
 const y=Math.round(height*QUICK_BAR_POINT[1]);
 const result=await v.s.operation('拉满快速完成次数',()=>v.s.controller.post_click(x,y).wait());
 if(!result.succeeded)throw new Error('快速完成次数拉满点击失败');
 console.log(count===1
   ?'快速完成：当前 1 次，已点击滑条右侧尝试拉满（若仍是 1 次，则黄条不会到头，按可用上限出发）'
   :`快速完成：${count} 次且黄条未到头，已点击滑条右侧拉满`);
 await sleep(300);
}
// 「快速完成结果」结算页识别：标题最关键；标题若被立绘压住，退化为「完成次数N」+「确定」双命中。
async function quickResult(v){
 return v.frame(async()=>{
  if(await v.ocr('^快速完成结果$',QUICK_RESULT_TITLE_ROI))return true;
  return Boolean(await v.ocr('^完成次数\\s*\\d+$',QUICK_RESULT_COUNT_ROI) && await v.ocr('^确定$',QUICK_OK_ROI));
 });
}
// 点「确定」关闭结算页，直到回廊关卡页重新出现「扫荡」。OCR 抖动时按按钮固定位置兜底。
async function confirmQuickResult(v){
 const hit=await v.ocr('^确定$',QUICK_OK_ROI);
 if(hit){
  await v.textStep('^确定$',()=>v.ocr('^扫荡$',[850,570,300,150]),'关闭快速完成结果',QUICK_OK_ROI,{irreversible:true});
  return;
 }
 console.log('快速完成结果页未识别到「确定」，按按钮固定位置兜底');
 const [width,height]=v.size||[1280,720];
 const result=await v.s.operation('点击快速完成结果确定',
   ()=>v.s.controller.post_click(Math.round(width*QUICK_OK_POINT[0]),Math.round(height*QUICK_OK_POINT[1])).wait());
 if(!result.succeeded)throw new Error('快速完成结果确定按钮点击失败');
 await sleep(600);
 if(!await v.ocr('^扫荡$',[850,570,300,150]))
  throw new Error('快速完成结果未关闭：已点击确定但仍未回到回廊关卡页');
}
async function sweepCorridor(v,{maxRounds=100,pause=sleep}={}) {
 const detail=async()=>!await stamina()&&!await corridorResult(v)&&!await quickResult(v)&&!await v.ocr('^出发$',[650,450,420,180])&&await v.ocr('^扫荡$',[850,570,300,150]);
 const anyResult=()=>v.frame(async()=>await corridorResult(v)||await quickResult(v));
 const stamina=()=>v.ocr('^下次恢复时间$',[350,0,700,220]);
 for(let round=1;round<=maxRounds;round++){
  // 升级弹窗会盖住回廊结果页，先关掉再继续，避免后续判定被阻塞。
  if(await dismissLevelUp(v,{name:'清体力回廊'}))continue;
  await v.textStep('^扫荡$',async()=>await stamina()||await v.ocr('^出发$',[650,450,420,180]),`第${round}次扫荡`,[850,570,300,150]);
  if(await stamina()){
   await v.blankUntil(stamina,detail,'关闭体力不足弹窗',{x:0.93,y:0.72});
   return;
  }
  const filled=await fillQuickCount(v);   // 新版「快速完成」弹窗：先把次数拉到最大（最多 5 次）
  if(filled==='cancelled')return;
  await v.textStep('^出发$',anyResult,'扫荡出发',[650,450,420,180],{irreversible:true});
  if(await quickResult(v)){
   // 多次扫荡：先点「确定」回到关卡页，否则之后既找不到「扫荡」也点不动
   await confirmQuickResult(v);
   console.log(`第${round}次扫荡完成（快速完成结果，已点确定），继续检查剩余体力`);
  }else{
   // click() already waits 500 ms; result recognition gates all blank clicks.
   await v.blankUntil(()=>corridorResult(v),detail,'关闭探索完成',{x:0.90,y:0.60});
   console.log(`第${round}次扫荡完成，继续检查剩余体力`);
  }
  await pause(100);
 }
 throw new Error('回廊扫荡达到保护上限，尚未确认体力不足');
}
module.exports={sweepCorridor,readVinylCap,quickResult,VINYL_ROI};
