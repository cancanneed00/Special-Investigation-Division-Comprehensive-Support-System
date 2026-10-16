const {Flow}=require('./lib/flow');
const {closeFriend}=require('./lib/friend-window');
function rearHalf(r){if(!r)return null;const copy=structuredClone(r);const b=copy.detail.best.box;b[0]+=Math.round(b[2]*0.65);b[2]=Math.max(1,Math.floor(b[2]*0.3));return copy;}
async function friendClaimAvailable(v){
 if(await v.ocr('.*今日领取次数.*用尽.*',[900,480,380,170]))return false;
 return !!await v.ocr('^可领取$',[900,500,380,150]);
}
async function run(session){
 const v=new Flow(session),pending=[];
 const daily=()=>v.ocr('^日常任务$',[0,65,430,120]);
 const city=async()=>!await friend()&&await v.ocr('^好友互助$',[900,580,380,140]);
 const friend=()=>v.ocr('^好友互助$',[0,40,430,150]);
 const cleared=async()=>await v.ocr('^CLEARED$',[450,220,760,360])&&await v.ocr('.*当前没有特别.*',[400,300,850,230]);
 await v.step(()=>v.homeButton('tasks'),()=>v.ocr('^日常任务$',[450,0,800,100]),'进入任务');
 await v.step(async()=>rearHalf(await v.ocr('^日常任务$',[450,0,800,100])),daily,'点击日常任务后半段');
 if(!await cleared()){
  const claim=await v.ocr('^全部领取$',[900,560,380,160]);
  if(claim){
   await v.step(()=>v.ocr('^全部领取$',[900,560,380,160]),()=>v.reward(),'日常全部领取',{irreversible:true});
   await v.dismissReward(daily);
  }
  if(!await cleared())pending.push('日常任务未显示 CLEARED 和完成说明');
 }
 await v.textStep('^市区巡逻$',city,'进入市区巡逻',[900,0,380,110]);
 await v.textStep('^好友互助$',friend,'进入好友互助',[900,580,380,140]);
 const giftFull=()=>v.ocr('^本日赠送已满$',[900,70,380,180]);
 if(!await giftFull()){
  const auto=await v.wait(()=>v.ocr('^自动勾选$',[650,40,420,190]),'自动勾选');
  await v.click(auto,'自动勾选好友');
  await v.step(()=>v.ocr('^赠送$',[900,130,380,190]),()=>v.reward(),'赠送所选好友',{irreversible:true});
  await v.dismissReward(friend);
  if(!await giftFull())pending.push('好友赠送未达到本日赠送已满');
 }
 // A disabled 可领取 label may remain after claiming. Send at most once.
 if(await friendClaimAvailable(v)){
  try{
   await v.step(()=>v.ocr('^可领取$',[900,500,380,150]),()=>v.reward(),'领取好友返还',{irreversible:true});
   await v.dismissReward(friend);
  }catch(error){if(!await friend())throw error;console.log('好友返还没有出现奖励，记录未确认并继续关闭弹层');pending.push('好友返还未出现奖励');}
 }
 await closeFriend(v);
 const patrolDone=()=>v.ocr('^已领取$',[930,500,330,150]);
 if(!await patrolDone()){
  await v.textStep('^每日领取$',()=>v.reward(),'市区巡逻每日领取',[930,500,330,150],{irreversible:true});
  await v.dismissReward(city);
  await v.wait(patrolDone,'每日领取显示已领取');
 }
 const buy=()=>v.ocr('.*全部购入.*',[100,450,300,140]);
 if(await buy()){
  await v.step(buy,()=>v.reward(),'市区巡逻全部购入',{irreversible:true});
  await v.dismissReward(city);
  await v.wait(async()=>!await buy(),'全部购入按钮消失');
 }
 await v.homeReturn();
 if(pending.length)throw new Error('其余领取已执行；'+pending.join('；'));
}
module.exports={run,rearHalf,friendClaimAvailable};
