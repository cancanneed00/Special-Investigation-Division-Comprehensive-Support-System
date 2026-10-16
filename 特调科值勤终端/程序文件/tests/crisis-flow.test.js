const {test}=require('node:test'),assert=require('node:assert/strict');const {Vision}=require('../lib/vision');
const {run}=require('../run_crisis_action');
function scenario(orders){
 let state='home',selected=false,quantity=1,swipes=0,clock=0;const actions=[],boxes=new Map();
 const s={slowScale:1,performance:{pollMs:150,operationTimeoutMs:60000},check(){},operation:async(l,fn)=>fn()};const v=new Vision(s);v.saveDiagnostic=()=>{};
 const wait=v.wait.bind(v);v.wait=(p,l,o)=>wait(p,l,{...o,now:()=>clock,pause:async ms=>{clock+=ms;}});
 function reco(text){let box=boxes.get(text);if(!box){box=[20+boxes.size*30,200,25,25];boxes.set(text,box);}return {hit:true,detail:{best:{text,score:.99,box}}};}
 v.capture=async()=>{v.size=[1280,720];return new ArrayBuffer(0);};
 v.recognize=async(type,p)=>{
  clock+=100;
  if(type==='TemplateMatch'){
   if(p.template==='商店_左上返回箭头.png'&&['system','stage'].includes(state))return reco('back');
   if(p.template==='流程_危机加号.png'&&state==='modal')return reco('plus');return null;
  }
  const labels=state==='home'?[]:state==='system'?[String(orders),'危机行动调令']:state==='stage'?['快速完成',...(swipes?['S303 乐园梦魇III']:[]),...(selected?['乐园梦魇III']:[])]:state==='modal'?[quantity+'次','出发']:state==='result'?['快速完成结果','确定']:[];
  const text=labels.find(t=>new RegExp(p.expected).test(t));return text?reco(text):null;
 };
 v.homeButton=async key=>{assert.equal(state,'home');assert.equal(key,'system');return reco('system');};v.home=async()=>state==='home';
 v.click=async r=>{
  const text=[...boxes].find(([,b])=>JSON.stringify(b)===JSON.stringify(r.detail.best.box))?.[0];assert.ok(text);actions.push(text);
  if(text==='system')state='system';else if(text===String(orders)&&state==='system')state='stage';else if(text.startsWith('S303'))selected=true;else if(text==='快速完成')state='modal';else if(text==='plus')quantity++;else if(text==='出发')state='result';else if(text==='确定')state='reward';else if(text==='back')state=state==='stage'?'system':'home';else assert.fail('unexpected '+text);
 };v.swipe=async()=>{assert.equal(state,'stage');swipes++;return {succeeded:true};};v.reward=async()=>state==='reward';v.rewardClick=async()=>{assert.equal(state,'reward');actions.push('reward');state='stage';};
 return {s,v,summary:()=>({state,quantity,swipes,actions})};
}
test('crisis unreadable settings: zero-order route returns home without spending',async()=>{
 const f=scenario(0);await run(f.s,{createVision:()=>f.v});assert.equal(f.summary().state,'home');assert.deepEqual(f.summary().actions,['system','back']);
});
test('crisis unreadable settings: full route selects S303, adjusts count, departs once, closes reward and returns home',async()=>{
 const f=scenario(2);await run(f.s,{createVision:()=>f.v});const a=f.summary();assert.equal(a.state,'home');assert.equal(a.quantity,2);assert.equal(a.swipes,1);assert.equal(a.actions.filter(t=>t==='出发').length,1);assert.ok(a.actions.includes('reward'));assert.deepEqual(a.actions.slice(-2),['back','back']);
});
