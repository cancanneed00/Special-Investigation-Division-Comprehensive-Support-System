const {sleep}=require('./flow');
const SIDEBAR=[30,80,195,580];
const externalLabel=v=>v.ocr('.*外部招募.*',SIDEBAR);
const recruitPage=v=>v.frame(async()=>Boolean(
  await v.template('主界面按钮.png',[250,0,150,80],0.7) &&
  await v.ocr('.*招募.*',SIDEBAR)));
async function settledLabel(v){
  try{return await v.wait(()=>externalLabel(v),'左栏外部招募标签',{timeout:1800,stable:1});}
  catch(error){if(error.code!=='RESULT_TIMEOUT')throw error;return null;}
}
async function enterExternal(v,marker,{pause=sleep}={}){
  if(await marker())return;
  if(!await recruitPage(v))await v.step(()=>v.homeButton('recruit'),()=>recruitPage(v),'打开招募界面');
  // Search the entire visible sidebar before scrolling. A removed event pool
  // moves this entry upward. Search downward first; reverse for saved offsets.
  let target=await settledLabel(v);
  const directions=[1,1,1,-1,-1,-1,-1,-1,-1];
  for(const direction of directions){
    if(target)break;
    v.s.check();
    await v.wait(async()=>!await v.loading() && await recruitPage(v),'招募列表稳定后滑动',{timeout:5000});
    target=await externalLabel(v);if(target)break;
    const result=await v.swipe(130,direction===1?590:220,130,direction===1?220:590,600,'招募列表滑动');
    if(!result.succeeded)throw new Error('招募列表滑动失败');
    await pause(800);v.s.check();
    target=await settledLabel(v);
  }
  if(!target)throw new Error('完整左栏双向查找后仍未识别外部招募，已停止，未点击其他招募池');
  // Probe must only recognize: step itself performs exactly one click.
  await v.step(()=>externalLabel(v),marker,'进入外部招募');
}
async function occupiedSlots(v){
  // 主检测：右侧招募位面板按“招募中”出现次数统计占用槽位。
  // 与左栏“N/4”徽标、侧栏滚动无关，最稳。
  try{
    const reco=await v.ocr('.*',[900,40,380,560]);
    const all=(reco&&reco.detail&&reco.detail.all)||[];
    const texts=all.map(e=>e&&e.text);
    const occupied=texts.filter(t=>t==='招募中').length;
    const idle=texts.filter(t=>t==='空闲').length;
    // 仅当确实识别到槽位状态（招募中/空闲）时才采信，避免整次读空误判为 0。
    if(reco&&reco.detail&&(occupied+idle)>=1&&occupied>=0&&occupied<=4)return occupied;
  }catch(_){}
  // 兜底：左栏“N/4”徽标（放宽到左边缘、标签上下的竖带，避免被屏幕左缘切掉）。
  const label=await externalLabel(v);
  const box=label?.detail?.best?.box;
  if(box){
    const top=Math.max(0,box[1]-90);
    const reco=await v.ocr('^[0-4][/／]4$',[0,top,200,150]);
    const m=reco?.detail?.best?.text?.match(/^([0-4])[/／]4$/);
    if(m)return Number(m[1]);
  }
  return null;
}
module.exports={SIDEBAR,externalLabel,recruitPage,enterExternal,occupiedSlots};
