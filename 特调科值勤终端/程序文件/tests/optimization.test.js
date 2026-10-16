const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {Vision}=require('../lib/vision');
const {observe,loadPerformance}=require('../lib/performance');
const {supervise}=require('../lib/supervisor');
function mockVision() {
  let captures=0,calls=0;
  const reco={hit:true,detail:{best:{text:'作战',box:[1000,300,80,40]},all:['招募','补给站','事务所','探员','作战','任务'].map(text=>({text}))}};
  const png=Buffer.alloc(24);png.write('PNG',1);png.writeUInt32BE(1280,16);png.writeUInt32BE(720,20);
  const s={performance:{provider:'CPU',pollMs:150},slowScale:1,check(){},async operation(label,fn){return fn();},
    controller:{post_screencap(){captures++;return {wait(){return {get:async()=>png};}};},post_click(){return {wait:async()=>({succeeded:true})};}},
    tasker:{post_recognition(){calls++;return {wait:async()=>({get:async()=>({nodes:[1]})})};},node_detail(){return {reco};}}};
  const v=new Vision(s);v.saveDiagnostic=()=>{};
  return {v,s,reco,counts:()=>({captures,calls})};
}
test('same frame reuses screenshot and identical recognition; next frame refreshes',async()=>{
  const {v,counts}=mockVision();
  await v.frame(async()=>{await v.ocr('a');await v.ocr('a');await v.ocr('b');});
  assert.deepEqual(counts(),{captures:1,calls:2});
  await v.frame(()=>v.ocr('a'));
  assert.deepEqual(counts(),{captures:2,calls:3});
});
test('frame cache is discarded after a failed probe',async()=>{
  const {v,counts}=mockVision();
  await assert.rejects(v.frame(async()=>{await v.ocr('a');throw Error('probe');}));
  await v.frame(()=>v.ocr('a'));assert.equal(counts().captures,2);
});
test('click invalidates the current frame',async()=>{
  const {v,reco,counts}=mockVision();
  await v.frame(async()=>{await v.ocr('a');await v.click(reco,'test');await v.ocr('a');});
  assert.equal(counts().captures,2);assert.equal(counts().calls,2);
});
test('home requires multiple menu labels and rejects a reward overlay',async()=>{
  const {v,reco}=mockVision();v.reward=async()=>null;
  assert.equal(await v.home(),true);
  reco.detail.all=[{text:'作战'}];assert.equal(await v.home(),false);
  reco.detail.all=['招募','补给站','事务所','探员'].map(text=>({text}));v.reward=async()=>({hit:true});assert.equal(await v.home(),false);
});
test('stable confirmation uses two distinct frames',async()=>{
  const {v,counts}=mockVision();await v.wait(()=>v.ocr('a'),'test',{timeout:1000});
  assert.deepEqual(counts(),{captures:2,calls:2});
});
test('slow results do not succeed beyond the hard deadline',async()=>{
  const {v}=mockVision();
  let clock=0;
  await assert.rejects(v.wait(async()=>{clock+=61000;return true;},'expired',{timeout:2,stable:1,now:()=>clock,pause:async ms=>{clock+=ms;}}),{code:'RESULT_TIMEOUT'});
});
test('reported 27 second probes can confirm two consecutive frames',async()=>{
  const {v}=mockVision();let clock=0,calls=0;
  const options={timeout:5000,now:()=>clock,pause:async ms=>{clock+=ms;}};
  const result=await v.wait(async()=>{calls++;clock+=calls===1?8000:27000;return calls>1;},'商店慢机复现',options);
  assert.equal(result,true);assert.equal(calls,3);assert.ok(clock>40000);
});
test('unmatched slow probes still terminate within a fixed budget',async()=>{
  const {v}=mockVision();let clock=0;
  await assert.rejects(v.wait(async()=>{clock+=27000;return false;},'不匹配',{timeout:5000,now:()=>clock,pause:async ms=>{clock+=ms;}}),{code:'RESULT_TIMEOUT'});
  assert.ok(clock<160000);
});
test('recognition allowance never bypasses session cancellation or task deadline',async()=>{
  const {v,s}=mockVision();let clock=0;
  s.check=()=>{if(clock>40000)throw Error('task deadline');};
  await assert.rejects(v.wait(async()=>{clock+=27000;return true;},'慢机',{timeout:5000,now:()=>clock,pause:async ms=>{clock+=ms;}}),/task deadline/);
});
test('shop marker uses a small region and rejects reward overlays',async()=>{
  const {v}=mockVision();let roi;
  v.ocr=async(expected,region)=>{roi=region;return {hit:true};};v.reward=async()=>null;
  assert.ok(await v.shop());assert.deepEqual(roi,[70,290,140,85]);
  v.reward=async()=>({hit:true});assert.equal(await v.shop(),null);
});
test('performance scale adapts to sustained slowdown and stays bounded',()=>{
  const s={performance:{mode:'balanced'}};
  observe(s,100);for(let i=0;i<5;i++)observe(s,12000);assert.equal(s.slowScale,5);
  for(let i=0;i<7;i++)observe(s,100000);assert.equal(s.slowScale,8);
  for(let i=0;i<7;i++)observe(s,100);assert.equal(s.slowScale,1);
});
test('reward close scales the deadline only once',async()=>{
  const {Flow}=require('../lib/flow');
  const original=Vision.prototype.dismissReward;
  let supplied;
  Vision.prototype.dismissReward=async function(probe,options){supplied=options.timeout;};
  try {
    const f=new Flow({slowScale:8});await f.dismissReward(()=>true);
    assert.equal(supplied,15000);
  }finally{Vision.prototype.dismissReward=original;}
});
test('reward closing requires two fresh successful post-close frames',async()=>{
  const {v}=mockVision();let open=true,clicks=0,confirmations=0;
  v.reward=async()=>open?{hit:true}:null;
  v.rewardClick=async()=>{clicks++;open=false;v.invalidate();};
  await v.dismissReward(async()=>{confirmations++;return true;},{timeout:1000});
  assert.equal(clicks,1);assert.equal(confirmations,2);
});
test('invalid performance settings fail clearly; low mode sets a minimum interval',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echoes-config-'));
  try {fs.writeFileSync(path.join(dir,'性能配置.json'),JSON.stringify({mode:'low'}));assert.equal(loadPerformance(dir).pollMs,1000);
    fs.writeFileSync(path.join(dir,'性能配置.json'),JSON.stringify({provider:'bogus'}));assert.throws(()=>loadPerformance(dir),/provider/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('supervisor terminates a worker with a blocked event loop',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echoes-watchdog-'));
  try {
    const entry=path.join(dir,'hung.js');
    fs.writeFileSync(entry,"process.send({kind:'operation-start',label:'模拟 OCR',timeout:200},()=>{while(true){}});");
    const start=Date.now();const code=await supervise(entry,dir,{args:[],initialTimeout:5000});
    assert.equal(code,2);assert.ok(Date.now()-start<10000);
    assert.match(JSON.parse(fs.readFileSync(path.join(dir,'运行_UI状态.json'))).current,/模拟 OCR.*超时/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('supervisor honors stop requests and cleans its worker lock after exit',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echoes-stop-'));
  try {
    const entry=path.join(dir,'stop.js');
    fs.writeFileSync(entry,"require('fs').writeFileSync('运行锁.json',JSON.stringify({pid:process.pid}));require('fs').writeFileSync('停止请求','stop');setInterval(()=>{},1000);");
    assert.equal(await supervise(entry,dir,{args:[]}),0);
    assert.equal(fs.existsSync(path.join(dir,'运行锁.json')),false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'运行_UI状态.json'))).state,'stopped');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
