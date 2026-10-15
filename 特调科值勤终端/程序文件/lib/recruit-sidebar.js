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
  if(!await recruitPage(v))await v.textStep('^招募$',()=>recruitPage(v),'打开招募界面');
  // Search the entire visible sidebar before scrolling. A removed event pool
  // moves this entry upward. Search downward first; reverse for saved offsets.
  let target=await settledLabel(v);
  const directions=[1,1,1,-1,-1,-1,-1,-1,-1];
  for(const direction of directions){
    if(target)break;
    v.s.check();
    if(await v.loading() || !await recruitPage(v))throw new Error('未确认招募列表，停止滑动');
    v.invalidate();
    const result=await v.s.operation('滚动招募左栏',()=>v.s.controller.post_swipe(
      130,direction===1?590:220,130,direction===1?220:590,600).wait());
    if(!result.succeeded)throw new Error('招募列表滑动失败');
    await pause(800);v.s.check();
    target=await settledLabel(v);
  }
  if(!target)throw new Error('完整左栏双向查找后仍未识别外部招募，已停止，未点击其他招募池');
  // Probe must only recognize: step itself performs exactly one click.
  await v.step(()=>externalLabel(v),marker,'进入外部招募');
}
async function occupiedSlots(v){
  return v.frame(async()=>{
    const label=await externalLabel(v);
    const box=label?.detail?.best?.box;if(!box)return null;
    const top=Math.max(80,box[1]-85);
    const reco=await v.ocr('^[0-4][/／]4$',[30,top,195,Math.min(120,720-top)]);
    const match=reco?.detail?.best?.text?.match(/^([0-4])[/／]4$/);
    return match?Number(match[1]):null;
  });
}
module.exports={SIDEBAR,externalLabel,recruitPage,enterExternal,occupiedSlots};
