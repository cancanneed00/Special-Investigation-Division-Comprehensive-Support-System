const {Flow,integer,sleep}=require('./flow');
const {OfficeInventory}=require('./office-inventory');
function refillAllowed(keys){return Number.isInteger(keys)&&keys>=60;}
class OfficeFlow {
 constructor(v,first='星砂',second='金钱'){this.v=v;this.first=first;this.second=second;}
 meditation(){return this.v.ocr('^冥想日志$',[300,0,680,180]);}
 home(){return this.v.ocr('^库存$',[720,620,180,100]);}
 empty(){return this.v.ocr('^暂无档案残片$',[300,200,850,320]);}
 archive(){return this.v.frame(async()=>await this.count()||await this.v.ocr('^事务所档案$',[0,600,290,95]));}
 // The supplied failure screenshot is read as “档案残9/12” by the real OCR.
 // Permit the one missing glyph only in this tightly scoped page marker.
 count(){return this.v.ocr('^已积累.*档案残片?.*[0-9]+[/／]12$',[40,505,260,45]);}
 async countValue(){const r=await this.count();const m=r?.detail?.best?.text.match(/(\d+)[/／]12/);return m?Number(m[1]):null;}
 firstCard(){return this.v.recognize('OCR',{expected:'.+',roi:[300,65,980,70],order_by:'Horizontal'});}
 candidate(){return this.v.ocr('^开始仪式$',[40,480,1100,150]);}
 async candidatePage(){return await this.candidate()||await this.v.ocr('^物品不足$',[40,480,1100,150]);}
 result(){return this.v.ocr('^解读(结果|成果)$',[0,30,600,220]);}
 icon(kind){return this.v.template(`事务所_筛选_${kind}.png`,[1100,150,180,460],0.72);}
 async selected(kind){
  const r=await this.icon(kind);if(!r)return false;
  const [x,y,w,h]=r.detail.best.box;
  return this.v.recognize('ColorMatch',{roi:[x,y,w,h],method:4,lower:[70,62,50],upper:[88,80,68],count:Math.floor(w*h*0.25),connected:false});
 }
 async select(kind){
  await this.v.step(()=>this.icon(kind),()=>this.selected(kind),`选择${kind}并检查高亮`);
 }
 async readCards(){
  const v=this.v;
  for(let round=0;round<64;round++){
   await v.wait(()=>this.archive(),'解读仪式页');
   if(!await this.firstCard()&&await this.empty())return 'empty';
   await v.step(()=>this.firstCard(),()=>this.candidatePage(),'选择第一张档案卡');
   await this.select(this.first);
   if(await v.ocr('.*缺货.*',[60,320,290,220]))await this.select(this.second);
   if(await v.ocr('.*缺货.*',[60,320,290,220])){
    console.log('两个优先类型均缺货，点击左上返回，结束本轮解读，不追加档案');
    await v.back(()=>this.archive());
    return 'shortage';
   }
   const start=await v.wait(()=>v.ocr('^开始仪式$',[40,480,320,150]),'开始仪式按钮',{stable:1});
   await v.click(start,'第一个候选开始仪式');
   await require('./office-progress').finishCard(this);
  }
  throw new Error('解读超过64轮保护上限');
 }
 async refill(){
  const v=this.v;
  const modal=()=>v.ocr('^追加档案残片$',[400,110,520,110]);
  await v.textStep('^追加档案残片$',modal,'打开追加档案残片',[780,560,470,150]);
  const keys=integer(await v.wait(()=>v.ocr('^[0-9]+$',[590,225,105,75]),'追加前钥匙数量'));
  if(!Number.isInteger(keys))throw new Error('钥匙数量无法确认');
  if(!refillAllowed(keys)) {
   console.log(`钥匙 ${keys}，不足60，取消追加后继续清仓`);
   await v.textStep('^取消$',async()=>!await modal()&&await this.empty(),'取消追加',[300,450,320,100]);
   return false;
  }
  const qty=async()=>integer(await v.ocr('^[0-9]+$',[570,370,110,80]));
  const before=await qty();if(before!==1)throw new Error('追加初始数量不是1，停止以免多花钥匙');
  // Exactly one increment, then reread. Do not blindly resend an increment.
  if(keys>=120)await v.step(()=>v.template('流程_追加加号.png',[650,340,250,130],0.76),async()=>await qty()===Math.min(2,Math.floor(keys/60)),'追加数量加一',{irreversible:true});
  const remaining=integer(await v.ocr('^-?[0-9]+$',[735,225,100,80]));
  if(remaining===null||remaining<0)throw new Error('追加后的钥匙余额无效');
  await v.textStep('^追加$',async()=>!await modal()&&await this.archive()&&await this.firstCard(),'确认追加并检查新卡片',[650,450,300,100],{irreversible:true});
  return true;
 }
 async readAllAndRefill(){
  while(true){
   this.v.s.check();
   const outcome=await this.readCards();
   if(outcome==='shortage')return outcome;
   if(outcome!=='empty')throw new Error('未明确确认档案已空，停止补卡');
   if(!await this.refill())return 'empty';
  }
 }
 async run(){
  const v=this.v;
  await v.act(()=>v.homeButton('office'),async()=>await this.meditation()||(!await v.loading()&&await this.home()),'进入事务所',{attempts:3,timeout:45000});
  await v.wait(async()=>!await v.loading()&&(await this.home()||await this.meditation()),'事务所加载结束',{timeout:45000});
  await sleep(3000);
  if(await this.meditation())await v.blankUntil(()=>this.meditation(),()=>this.home(),'关闭冥想日志',{x:0.93,y:0.82});
  await v.step(()=>v.template(['流程_解读图标.png','事务所_解读按钮.png'],[1080,560,200,160],0.78),()=>this.archive(),'进入解读仪式');
  const outcome=await this.readAllAndRefill();
  if(outcome==='empty')await v.wait(()=>this.empty(),'全部档案解读完毕');
  else console.log('缺货退出已确认；保留未解读档案，继续库存整理并返回主页');
  await v.back(()=>this.home());
  await new OfficeInventory(v).run();
  await this.returnHome();
 }
 async returnHome(){
  const v=this.v;
  const leave=()=>v.ocr('.*是否离开事务所.*');
  await v.step(()=>v.template('事务所_退出图标.png',[0,0,250,130]),leave,'退出事务所');
  await v.step(()=>v.template('事务所_离开确认对号.png',[350,200,650,350]),async()=>await v.loading()||await v.home(),'确认离开事务所');
  await v.wait(async()=>!await v.loading()&&await v.home(),'加载后返回主界面',{timeout:45000});
 }
}
async function recoverArchive(v){
 const office=new OfficeFlow(v);
 if(!await office.archive())return false;
 if(!await office.firstCard()||await office.candidatePage()||await v.ocr('^追加档案残片$',[400,110,520,110])||await v.reward())return false;
 console.log('恢复：已确认事务所档案页，按事务所路径返回主页');
 await v.back(async()=>await office.home()||await office.meditation());
 if(await office.meditation())await v.blankUntil(()=>office.meditation(),()=>office.home(),'关闭恢复中的冥想日志',{x:0.93,y:0.82});
 await v.wait(()=>office.home(),'恢复中的事务所首页');
 await office.returnHome();
 return true;
}
module.exports={OfficeFlow,refillAllowed,recoverArchive};

