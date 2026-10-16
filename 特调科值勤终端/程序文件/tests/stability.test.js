const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {Flow}=require('../lib/flow');const {Vision}=require('../lib/vision');const {Session}=require('../lib/session');const {Diagnostics}=require('../lib/diagnostics');const {legacyRecognize}=require('../lib/legacy-recognition');
function timed(v){let clock=0;const wait=v.wait.bind(v);v.saveDiagnostic=()=>{};v.wait=(p,l,o)=>wait(p,l,{...o,now:()=>clock,pause:async ms=>{clock+=ms;}});return ms=>{clock+=ms;};}
function session(){return {performance:{pollMs:150,operationTimeoutMs:60000},slowScale:1,check(){},operation:async(l,fn)=>fn()};}
test('diagnostics sample writes, preserve paired input, and force failure immediately',()=>{
 let clock=0;const writes=[];const d=new Diagnostics('unused',{now:()=>clock,io:{mkdirSync(){},writeFileSync(p,b){writes.push([path.basename(p),b]);}}});
 for(let i=0;i<100;i++){clock=i*100;const s={lastImage:Buffer.from('frame'+i),pendingRecognition:{id:i}};d.save(s);d.save({...s,pendingRecognition:null,diagnosticHistory:[{id:i}]});}
 assert.equal(writes.filter(([p])=>p==='最近识别.json').length,5);assert.equal(writes.filter(([p])=>p==='最近识别截图.png').length,5);
 d.save({lastImage:Buffer.from('failed'),diagnosticHistory:[{id:101}]},'failure');assert.equal(writes.findLast(([p])=>p==='最近失败截图.png')[1].toString(),'failed');assert.equal(JSON.parse(writes.findLast(([p])=>p==='最近失败.json')[1]).history[0].id,101);
});
test('unchanged diagnostic images are not rewritten; low mode can sample every five seconds',()=>{
 let clock=0,png=0,json=0;const d=new Diagnostics('unused',{intervalMs:5000,now:()=>clock,io:{mkdirSync(){},writeFileSync(p){if(p.endsWith('.png'))png++;else json++;}}});
 for(let i=0;i<10;i++){clock=i*1000;d.save({lastImage:Buffer.from('same')});}assert.equal(png,1);assert.equal(json,2);
});
test('diagnostic disk error remains nonfatal and throttled',()=>{
 let calls=0;const d=new Diagnostics('unused',{now:()=>0,io:{mkdirSync(){calls++;throw Error('disk');}}});assert.equal(d.save({}),false);assert.equal(d.save({}),false);assert.equal(calls,1);
});
test('legacy crisis OCR uses shared native operation and cancellation path',async()=>{
 const labels=[];let hits=0;const s=session();s.operation=async(l,fn)=>{labels.push(l);return fn();};s.tasker={post_recognition:()=>({wait:async()=>({get:async()=>({nodes:[1]})})}),node_detail:()=>({reco:++hits>=2?{hit:true,detail:{best:{text:'设置'}}}:null})};
 const v=new Vision(s);timed(v);v.capture=async()=>new ArrayBuffer(0);const r=await legacyRecognize(v,'OCR',{expected:'^设置$'},{attempts:3});assert.equal(r.detail.best.text,'设置');assert.deepEqual(labels,['OCR 识别','OCR 识别']);
 s.check=()=>{throw Error('stop');};await assert.rejects(legacyRecognize(v,'OCR',{},{}),/stop/);
});
test('legacy optional recognition returns null only for result timeout',async()=>{
 const v=new Vision(session());timed(v);v.recognize=async()=>null;assert.equal(await legacyRecognize(v,'OCR',{}, {attempts:2}),null);
 v.recognize=async()=>{throw Error('native error');};await assert.rejects(legacyRecognize(v,'OCR',{}, {attempts:2}),/native error/);
});
test('task budget grows from original start, stays capped, recovery stays fixed',()=>{
 const original=Date.now;let clock=1000;Date.now=()=>clock;try{const s=Object.create(Session.prototype);s.deadline=Infinity;s.slowScale=1;s.setBudget(10000);assert.equal(s.deadline,11000);clock=5000;s.peakSlowScale=5;s.refreshBudget();assert.equal(s.deadline,51000);s.peakSlowScale=100;s.refreshBudget();assert.equal(s.deadline,81000);s.setBudget(120000,1,false);assert.equal(s.deadline,125000);s.clearBudget();assert.equal(s.deadline,Infinity);}finally{Date.now=original;}
});
test('loading before irreversible click re-recognizes without duplicate submission',async()=>{
 let scans=0,sent=0;const v=new Vision(session());timed(v);v.click=async target=>{if(scans===1){const e=Error('loading');e.code='PAGE_TRANSITION';throw e;}assert.equal(target.id,2);sent++;};
 await v.act(async()=>({id:++scans}),async()=>true,'spend',{attempts:1});assert.equal(sent,1);assert.equal(scans,2);
});
test('irreversible action is never replayed when confirmation times out',async()=>{
 let sent=0;const v=new Vision(session());timed(v);v.click=async()=>{sent++;};await assert.rejects(v.act(async()=>({}),async()=>false,'spend',{attempts:1,timeout:100}),{code:'RESULT_TIMEOUT'});assert.equal(sent,1);
});
test('blank close waits through a disappearing guard and loading without clicking',async()=>{
 let calls=0,clicks=0;const v=new Flow(session());timed(v);v.reward=async()=>false;v.loading=async()=>false;v.blank=async()=>{calls++;return false;};
 await v.blankUntil(async()=>calls<1,async()=>true,'transition');assert.equal(calls,1);assert.equal(clicks,0);
 v.loading=async()=>true;v.s.controller={post_click(){clicks++;}};assert.equal(await v.blank('loading',async()=>true),false);assert.equal(clicks,0);
});
test('friend workflow waits for transient title then closes in fullscreen before restore',async()=>{
 const {closeFriend}=require('../lib/friend-window');const s=session(),v=new Flow(s);timed(v);let titleReads=0,closed=false;const events=[];
 v.capture=async()=>{v.size=s.friendFullscreen?[1280,800]:[1280,720];return new ArrayBuffer(0);};
 v.ocr=async(pattern,roi)=>{if(roi[1]<100)return ++titleReads>2&&!closed?{}:null;return closed?{}:null;};v.template=async()=>({detail:{best:{box:[1188,103,84,78]}}});
 await closeFriend(v,async(mode,point)=>{events.push(mode);if(mode==='click'){assert.equal(s.friendFullscreen,true);assert.equal(point.ImageHeight,800);closed=true;}if(mode==='restore')assert.equal(closed,true);},{pause:async()=>{}});
 assert.equal(s.friendFullscreen,false);assert.equal(events.filter(e=>e==='click').length,1);assert.equal(events.at(-1),'restore');
});
test('swipe validates bounds, invalidates frame and reports native failure',async()=>{
 const v=new Vision(session());v.size=[1280,720];let invalidated=0;v.invalidate=()=>invalidated++;v.s.controller={post_swipe:()=>({wait:async()=>({succeeded:false})})};await assert.rejects(v.swipe(100,600,100,200,600),/失败/);assert.equal(invalidated,1);await assert.rejects(v.swipe(-1,0,100,200,600),/参数/);
});
test('runtime metrics report latency and task outcome without changing control flow',()=>{
 const {RunMetrics}=require('../lib/run-metrics');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echoes-metrics-'));try{const m=new RunMetrics(dir,{mode:'low'});m.record('OCR',100,false);m.record('OCR',300,true);m.task('test','failed',500);const data=JSON.parse(fs.readFileSync(m.file));assert.deepEqual(data.operations.OCR,{count:2,totalMs:400,maxMs:300,failed:1});assert.equal(data.tasks[0].outcome,'failed');assert.ok(data.workerMemory.rss>0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
