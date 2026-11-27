const {test}=require('node:test'),assert=require('node:assert/strict');const {Vision}=require('../lib/vision');
const {run}=require('../run_crisis_action');
function scenario(orders,{initialQuantity=1,spaced='never',maxQuantity=99}={}){
 let state='home',selected=false,quantity=initialQuantity,swipes=0,clock=0,changed=false;const actions=[],boxes=new Map();
 const s={slowScale:1,performance:{pollMs:150,operationTimeoutMs:60000},check(){},operation:async(l,fn)=>fn()};const v=new Vision(s);v.saveDiagnostic=()=>{};
 const wait=v.wait.bind(v);v.wait=(p,l,o)=>wait(p,l,{...o,now:()=>clock,pause:async ms=>{clock+=ms;}});
 function reco(text){let box=boxes.get(text);if(!box){box=[20+boxes.size*30,200,25,25];boxes.set(text,box);}return {hit:true,detail:{best:{text,score:.99,box}}};}
 v.capture=async()=>{v.size=[1280,720];return new ArrayBuffer(0);};
 v.recognize=async(type,p)=>{
  clock+=100;
  if(type==='TemplateMatch'){
   if(p.template==='商店_左上返回箭头.png'&&['system','stage'].includes(state))return reco('back');
   if(p.template==='流程_危机加号.png'&&state==='modal')return reco('plus');
   if(p.template==='流程_危机减号.png'&&state==='modal')return reco('minus');return null;
  }
  const useSpace=spaced==='always'||(spaced==='afterChange'&&changed);
  const labels=state==='home'?[]:state==='system'?[String(orders),'危机行动调令']:state==='stage'?['快速完成',...(swipes?['S303 乐园梦魇III']:[]),...(selected?['乐园梦魇III']:[])]:state==='modal'?[quantity+(useSpace?' 次':'次'),'出发']:state==='result'?['快速完成结果','确定']:[];
  const text=labels.find(t=>new RegExp(p.expected).test(t));return text?reco(text):null;
 };
 v.recognizeScaled=async(expected,roi,scale)=>{
  clock+=100;
  if(state!=='system')return null;
  const r=reco(String(orders));
  return {text:String(orders),score:.99,box:r.detail.best.box};
 };
 v.homeButton=async key=>{assert.equal(state,'home');assert.equal(key,'system');return reco('system');};v.home=async()=>state==='home';
 v.click=async r=>{
  const text=[...boxes].find(([,b])=>JSON.stringify(b)===JSON.stringify(r.detail.best.box))?.[0];assert.ok(text);actions.push(text);
  if(text==='system')state='system';else if(text===String(orders)&&state==='system')state='stage';else if(text.startsWith('S303'))selected=true;else if(text==='快速完成')state='modal';else if(text==='plus'){if(quantity<maxQuantity)quantity++;changed=true;}else if(text==='minus'){quantity--;changed=true;}else if(text==='出发')state='result';else if(text==='确定')state='reward';else if(text==='back')state=state==='stage'?'system':'home';else assert.fail('unexpected '+text);
 };v.swipe=async()=>{assert.equal(state,'stage');swipes++;return {succeeded:true};};v.reward=async()=>state==='reward';v.rewardClick=async()=>{assert.equal(state,'reward');actions.push('reward');state='stage';};
 return {s,v,summary:()=>({state,quantity,swipes,actions})};
}
test('crisis unreadable settings: zero-order route returns home without spending',async()=>{
 const f=scenario(0);await run(f.s,{createVision:()=>f.v});assert.equal(f.summary().state,'home');assert.deepEqual(f.summary().actions,['system','back']);
});
test('crisis unreadable settings: full route selects S303, adjusts count, departs once, closes reward and returns home',async()=>{
 const f=scenario(2);await run(f.s,{createVision:()=>f.v});const a=f.summary();assert.equal(a.state,'home');assert.equal(a.quantity,2);assert.equal(a.swipes,1);assert.equal(a.actions.filter(t=>t==='出发').length,1);assert.ok(a.actions.includes('reward'));assert.deepEqual(a.actions.slice(-2),['back','back']);
});
test('crisis counts 0-6: quick count ends exactly at each order count',async()=>{
 const result=[];
 for(let n=0;n<=6;n++){
  const f=scenario(n);await run(f.s,{createVision:()=>f.v});const a=f.summary();
  assert.equal(a.state,'home',`调令 ${n}：未回到主界面`);
  assert.equal(a.actions.filter(t=>t==='出发').length,n>0?1:0,`调令 ${n}：出发次数不符`);
  if(n>0)assert.equal(a.quantity,n,`调令 ${n}：最终快速完成次数应为 ${n}，实际 ${a.quantity}`);
  result.push(`${n}->${n>0?a.quantity:'不进入弹窗'}`);
 }
 console.log('调令->最终次数:',result.join(' '));
});
test('crisis quick count tolerates OCR space in "快速完成次数2 次"',async()=>{
 for(const [orders,initial] of [[2,3],[4,3]]){
  const f=scenario(orders,{initialQuantity:initial,spaced:'always'});
  await run(f.s,{createVision:()=>f.v});const a=f.summary();
  assert.equal(a.state,'home',`调令 ${orders}：未回到主界面`);
  assert.equal(a.quantity,orders,`调令 ${orders}：最终次数应为 ${orders}，实际 ${a.quantity}`);
  assert.equal(a.actions.filter(t=>t==='出发').length,1,`调令 ${orders}：出发次数不符`);
 }
});
test('crisis realistic simulation 0-6: modal starts at 3, OCR adds space after adjustment',async()=>{
 const rows=[];
 for(let n=0;n<=6;n++){
  const f=scenario(n,{initialQuantity:3,spaced:'afterChange'});
  await run(f.s,{createVision:()=>f.v});const a=f.summary();
  assert.equal(a.state,'home',`调令 ${n}：未回到主界面`);
  assert.equal(a.actions.filter(t=>t==='出发').length,n>0?1:0,`调令 ${n}：出发次数不符`);
  if(n>0)assert.equal(a.quantity,n,`调令 ${n}：最终次数应为 ${n}，实际 ${a.quantity}`);
  const plus=a.actions.filter(t=>t==='plus').length,minus=a.actions.filter(t=>t==='minus').length;
  rows.push(`${n}:${plus}+/${minus}- => ${n>0?a.quantity:'不进弹窗'}`);
 }
 console.log('真机形态模拟:',rows.join(' | '));
});
test('crisis cap fallback: order 6 with modal cap 3 completes at 3 without error',async()=>{
 const f=scenario(6,{initialQuantity:3,maxQuantity:3});
 await run(f.s,{createVision:()=>f.v});const a=f.summary();
 assert.equal(a.state,'home');assert.equal(a.quantity,3);
 assert.equal(a.actions.filter(t=>t==='出发').length,1);
});
test('crisis zero-order single weak vote: 0 at 0.945 (real-machine shape) is accepted',async()=>{
 // 真机调令=0 实测：6 路探测里只有「整帧宽 ROI」读到 0(0.945)，
 // 其余路 null 或低分(0.38/0.46)，单票 <0.95 会让旧逻辑 12 轮全落空。
 const f=scenario(0);
 const base=f.v.recognize;
 f.v.recognize=async(type,p)=>{
  if(type==='OCR'&&p.expected==='^[0-6]$'){
   if(Array.isArray(p.roi)&&p.roi[0]===238&&p.roi[1]===405)
    return {hit:true,detail:{best:{text:'0',score:.945,box:[252,449,13,19]}}};
   return null;
  }
  return base(type,p);
 };
 f.v.recognizeScaled=async()=>null;
 await run(f.s,{createVision:()=>f.v});
 const a=f.summary();
 assert.equal(a.state,'home','调令 0 应返回主界面');
 assert.deepEqual(a.actions,['system','back'],'调令 0 不应点进关卡或出发');
});
