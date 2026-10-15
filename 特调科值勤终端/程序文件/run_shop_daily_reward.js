const {Flow}=require('./lib/flow');
async function dailyGiftState(v){
 const label=await v.ocr('.*每日礼包.*',[180,90,550,610]);if(!label)return null;
 const [x,y,w,h]=label.detail.best.box;
 return v.ocr('^(可领取|明日可领取)$',[Math.max(0,x-50),y,Math.min(w+100,1280-Math.max(0,x-50)),Math.min(h+95,720-y)]);
}
async function run(session) {
 const v=new Flow(session);
 const state=()=>dailyGiftState(v);
 await v.textStep('^补给站$',()=>v.shop(),'进入补给站',[850,490,210,110]);
 await v.step(()=>v.supportCabinet(),state,'进入支援货柜');
 const current=await v.wait(state,'每日礼包状态',{timeout:15000});
 if(current.detail.best.text==='可领取'){
  await v.step(state,()=>v.reward(),'领取每日礼包',{irreversible:true});
  await v.dismissReward(async()=> (await state())?.detail.best.text==='明日可领取');
 }
 await v.wait(async()=> (await state())?.detail.best.text==='明日可领取','每日礼包明日可领取',{timeout:15000});
 await v.homeReturn();
}
module.exports={run,dailyGiftState};
