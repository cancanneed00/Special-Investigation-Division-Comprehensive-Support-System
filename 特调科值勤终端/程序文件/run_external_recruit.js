const {enterExternal,occupiedSlots}=require('./lib/recruit-sidebar');
const {Flow,integer,sleep} = require('./lib/flow');
const {finishRecruitResult}=require('./lib/recruit-result');
// 右上角 HUD 的「外招券」数量格（游戏后台捕获恒归一化到 1280×720，故该坐标各机器一致）。
// 只框住第一格（券图标+数量），右边界刻意收在其后另一货币之前，避免把旁边的数量一并读进来。
// 数字被 OCR 成纯数字才采信，故图标会被 ^[0-9]+$ 过滤掉。
const TICKET_ROI=[1140,20,65,40];
// 可靠读取外招券数量：丢弃低置信度读数，需两次一致高分才采信；读不出返回 null（按未知处理，绝不贸然跳过）。
async function readTicketCount(v){
 const seen=new Map();
 for(let attempt=0;attempt<6;attempt++){
  const reco=await v.ocr('^[0-9]+$',TICKET_ROI);
  const best=reco&&reco.detail&&reco.detail.best;
  if(best&&best.score>=0.8){
   const value=Number(best.text);
   if(Number.isInteger(value)){
    const hits=(seen.get(value)||0)+1;seen.set(value,hits);
    if(hits>=2){console.log('外招券数量',{value});return value;}
   }
  }
  await sleep(400);
 }
 return null;
}
async function run(session) {
 const v=new Flow(session);
 const marker=()=>v.ocr('^(启动招募|招募成功|任务已满)$',[800,400,480,320]);
 await enterExternal(v,marker);
 // 外招券为 0 时无可招募券：直接退回主界面并正常结束，不再进入必然失败的招募循环。
 // 读不出数量时按未知处理，继续原流程（保持既有行为，避免误跳过）。
 const tickets=await readTicketCount(v);
 if(tickets===0){
  console.log('外招券为 0，跳过外部招募');
  await v.homeReturn();
  return;
 }
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
   // 每轮刷新剩余外招券：上一轮招募会消耗券，MAX 目标必须按“剩余券数”封顶。
   // 否则券不足时游戏最多只能选到 min(空槽, 券数)，与“填满空槽”(4-occupied)的期望值不一致，
   // MAX 校验会一直失败并重试（表现为连点 MAX 三次后报错）。读不出券数时按未知处理，保持原逻辑。
   const remaining=await readTicketCount(v);
   const want = remaining===null ? 4-occupied : Math.min(4-occupied, remaining);
   if(want<=0){console.log('外招券已用尽，结束外部招募');await v.homeReturn();return;}
   const modal=()=>v.ocr('单次耗时.*分钟',[400,180,500,160]);
   await v.textStep('^启动招募$',modal,'打开招募数量',[800,400,480,320]);
   const count=async()=>integer(await v.ocr('^[0-9]+$',[600,345,80,55]));
   // MAX is idempotent; verify a stable selected count, then require 任务已满 after confirmation.
   await v.step(()=>v.template('招募数量_MAX.png',[690,260,260,210],0.76),async()=>{
    const a=await count();return a===want && a===await count();
   },'选择招募 MAX');
   // 确认招募。MAX 目标已按剩余券数封顶，正常情况可顺利启动；
   // 此处仅作兜底：若券数读取偏差或游戏仍拒绝启动（「任务已满」不出现），
   // 不抛错中断整轮运行，而是关闭弹窗、退回主界面，让外部招募正常结束。
   let started=true;
   try{
    await v.textStep('^确定$',()=>v.ocr('^任务已满$',[800,400,480,320]),'确认招募并检查任务已满',[560,400,360,190],{irreversible:true});
   }catch(error){
    started=false;
    console.log('确定后招募未启动（外招券可能不足）：',error.message);
   }
   if(!started){
    // 弹窗可能仍在（取消/确定可见），先尽力点取消关上，再退回主界面。
    await v.textStep('^取消$',()=>v.ocr('^启动招募$',[800,400,480,320]),'关闭招募弹窗',[380,430,420,180]).catch(()=>{});
    await v.homeReturn();
    return;
   }
  }
 }
 throw new Error('招募循环达到保护上限');
}
module.exports={run};
