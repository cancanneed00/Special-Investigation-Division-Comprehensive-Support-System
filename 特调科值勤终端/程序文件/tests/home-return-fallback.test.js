const {test}=require('node:test');const assert=require('node:assert/strict');
const {Flow}=require('../lib/flow');
const {Vision}=require('../lib/vision');
// 主题皮肤会同时重绘「房子图标」与「左上返回箭头」，两层模板都可能失配。
// 此时必须靠与皮肤无关的 ESC 兜底回到主页，否则整轮运行会中止。
const realTemplate=Vision.prototype.template;
function makeFlow({supportKeys=true,homeAfter=2}={}){
  let escCount=0, homeCalls=0;
  const controller={post_click:()=>({wait:async()=>({succeeded:true})})};
  if(supportKeys)controller.post_click_key=()=>{escCount++;return {wait:async()=>({succeeded:true})};};
  const session={check(){},slowScale:1,operation:async(label,fn)=>fn(),
    performance:{pollMs:10,operationTimeoutMs:5000,mode:'balanced',provider:'test'},
    controller};
  const v=new Flow(session);
  v.size=[1280,720];
  v.home=async()=>{homeCalls++;return homeCalls>=homeAfter;};   // 前几次不在主页
  v.saveDiagnostic=()=>{};
  Vision.prototype.template=async()=>null;                       // 所有模板失配
  return {v,stats:()=>({escCount,homeCalls})};
}
test.after(()=>{Vision.prototype.template=realTemplate;});

test('ESC fallback returns home when every back template misses',async()=>{
  // home() 调用顺序：入口 1 次、模板失败后再探测 1 次，之后每次 ESC 各 1 次；第 4 次才判定为主页。
  const f=makeFlow({supportKeys:true,homeAfter:4});
  await f.v.homeReturn();
  assert.equal(f.stats().escCount,2,'应连按两次 ESC 才回到主页');
});
test('ESC fallback is skipped cleanly when the controller has no keyboard',async()=>{
  const f=makeFlow({supportKeys:false,homeAfter:99});
  await assert.rejects(f.v.homeReturn(),/ESC/,'无键盘支持时应抛出带指引的错误');
  assert.equal(f.stats().escCount,0,'不应尝试按键');
});
test('an exhausted ESC budget still reports how to add a new skin',async()=>{
  const f=makeFlow({supportKeys:true,homeAfter:99});
  await assert.rejects(f.v.homeReturn(),/HOME_TEMPLATES/,'应提示如何补充新皮肤图标');
  assert.equal(f.stats().escCount,3,'ESC 至多重试三次');
});
