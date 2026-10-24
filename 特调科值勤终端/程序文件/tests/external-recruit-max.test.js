const {test}=require('node:test');const assert=require('node:assert/strict');
const {run}=require('../run_external_recruit');
const {Vision}=require('../lib/vision');
// run(session) 内部自建 new Flow(session)，无法注入实例，故在原型层替换识别与点击。
// 每个测试文件由 node --test 独立进程执行，不会污染其它用例。
const realOcr=Vision.prototype.ocr,realTemplate=Vision.prototype.template,realClick=Vision.prototype.click;
let handler=null;
Vision.prototype.ocr=function(expected,roi){return handler.ocr(expected,roi);};
Vision.prototype.template=function(name){return handler.template(name);};
Vision.prototype.click=function(reco,label){return handler.click(reco,label,realClick.bind(this));};
Vision.prototype.saveDiagnostic=function(){};
// MAX 目标数必须按“剩余外招券”封顶：券不足时游戏只能选到 min(空槽, 券数)，
// 若仍按“填满空槽”(4-occupied) 校验，MAX 会反复重试直至失败。
function fixture({tickets=1,occupied=0,quantity=1}={}){
 const clicks=[];let confirmed=false;
 const hit=text=>({hit:true,detail:{best:{text,score:0.99,box:[700,400,100,50]},all:[{text,score:0.99,box:[700,400,100,50]}]}});
 const mainMenu=()=>({hit:true,detail:{best:{text:'招募',score:0.99,box:[40,100,80,30]},
  all:['招募','补给站','事务所','探员'].map((text,i)=>({text,score:0.99,box:[40+i*130,100+i*40,80,30]}))}});
 handler={
  ocr(expected,roi){
   if(expected==='.*获取物资.*')return null;
   // 主界面判定（全屏）与招募槽面板（右栏）都用 .*，按 ROI 区分；槽面板先判，否则被全屏分支吞掉。
   if(expected==='.*'){
    if(roi&&roi[0]===900){
     const all=[];for(let i=0;i<occupied;i++)all.push({text:'招募中'});for(let i=occupied;i<4;i++)all.push({text:'空闲'});
     return {hit:true,detail:{all}};
    }
    return roi&&roi[2]===1280?mainMenu():null;
   }
   // 外招券数量（右上一格）与招募数量（弹窗）都用 ^[0-9]+$，按 ROI 区分。
   if(expected==='^[0-9]+$'&&roi&&roi[0]===1140)return hit(String(tickets));
   if(expected==='^[0-9]+$')return hit(String(quantity));
   if(expected==='^(启动招募|招募成功|任务已满)$')return hit(confirmed?'任务已满':'启动招募');
   if(expected==='单次耗时.*分钟')return hit('单次耗时30分钟');
   if(expected==='^启动招募$')return hit('启动招募');
   if(expected==='^确定$')return hit('确定');
   if(expected==='^任务已满$')return confirmed?hit('任务已满'):null;
   return null;
  },
  // 仅 MAX 按钮匹配；其余（含加载标志）一律不匹配，避免误判为加载中。
  template(name){return name==='招募数量_MAX.png'?{hit:true,detail:{best:{box:[700,300,80,50]}}}:null;},
  async click(reco,label,fallback){clicks.push(label);if(/确认招募/.test(label))confirmed=true;return fallback(reco,label);}
 };
 const session={check(){},slowScale:1,operation:async(label,fn)=>fn(),
  performance:{pollMs:150,operationTimeoutMs:60000,mode:'balanced',provider:'test'},
  controller:{post_click:()=>({wait:async()=>({succeeded:true})})}};
 return {session,clicks};
}
test('single ticket caps MAX at one so the confirmation can start',async()=>{
 // 旧行为：目标恒为 4-occupied=4，而券只有 1 张只能选到 1，校验失败并重试 3 次后报错。
 const f=fixture({tickets:1,occupied:0,quantity:1});
 await run(f.session);
 assert.ok(f.clicks.some(label=>/选择招募 MAX/.test(label)),'应执行 MAX 点击');
});
test('plenty of tickets still fill every free slot',async()=>{
 const f=fixture({tickets:5,occupied:0,quantity:4});
 await run(f.session);
 assert.ok(f.clicks.some(label=>/选择招募 MAX/.test(label)),'应执行 MAX 点击');
});
test('MAX count is rejected when it exceeds the remaining tickets',async()=>{
 // 券只有 1 张却选到 4：付不起，必须判失败，证明校验确实绑定剩余券数。
 const f=fixture({tickets:1,occupied:0,quantity:4});
 await assert.rejects(run(f.session),/选择招募 MAX|结果未确认/);
});
test('MAX count below the predicted cap is accepted as long as it is affordable',async()=>{
 // 券 5 张、空槽 4 个，游戏 MAX 只给到 3（我们无法复刻其内部规则）。
 // 旧逻辑要求等于 min(空槽,券数)=4，3 不符会重试三次后报错；新逻辑只要求付得起，
 // 3<=5 直接通过——游戏给多少就用多少，不再因期望值过具体而空转。
 const f=fixture({tickets:5,occupied:0,quantity:3});
 await run(f.session);
 assert.ok(f.clicks.some(label=>/选择招募 MAX/.test(label)),'可支付的下限次数应被接受');
});
test('a zero MAX count is rejected even though it is affordable',async()=>{
 // 0 次虽然“不超过券数”，但点了确定也什么都召不到（弹窗未刷新/动画中会读到 0），
 // 必须靠下界拦住，否则会带着一个空选择进入确认。
 const f=fixture({tickets:5,occupied:0,quantity:0});
 await assert.rejects(run(f.session),/选择招募 MAX|结果未确认/);
});
test('unreadable ticket count still spends whatever the game allows',async()=>{
 // 券数读不出时不再要求“填满空槽”：只要 MAX 选到 1..空槽 之间的稳定值就继续招募。
 // 旧逻辑会按 4-occupied 校验，券不足时读到 1 便重试三次后报错，白扔掉可用的券。
 const f=fixture({tickets:null,occupied:0,quantity:1});
 await run(f.session);
 assert.ok(f.clicks.some(label=>/选择招募 MAX/.test(label)),'券数未知也应执行 MAX 并消耗券');
});
test('exhausted tickets end external recruitment without a failing loop',async()=>{
 // 剩余券 0：MIN(空槽,0)=0，直接结束，不进入必然失败的招募循环。
 const f=fixture({tickets:0,occupied:0,quantity:0});
 await run(f.session);
 assert.equal(f.clicks.some(label=>/选择招募 MAX/.test(label)),false,'券为 0 不应进入 MAX');
});
test.after(()=>{Vision.prototype.ocr=realOcr;Vision.prototype.template=realTemplate;Vision.prototype.click=realClick;});
