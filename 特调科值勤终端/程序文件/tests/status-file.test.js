const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os');
const {spawn}=require('child_process');
const {createStatusWriter}=require('../lib/status-file');
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echoes-status-'));const file=path.join(dir,'state.json');fs.writeFileSync(file,JSON.stringify({state:'old'}));return {dir,file};}
function sharingError(){return Object.assign(new Error('locked'),{code:'EPERM'});}

test('transient EPERM retries without exposing partial JSON',()=>{
  const {dir,file}=fixture();let calls=0;const pauses=[];
  try {
    const io={...fs,renameSync(from,to){calls++;assert.equal(JSON.parse(fs.readFileSync(file)).state,'old');if(calls<4)throw sharingError();fs.renameSync(from,to);}};
    const write=createStatusWriter(file,{io,pause:ms=>pauses.push(ms)});
    assert.equal(write({state:'running',current:'任务开始'}),true);
    assert.equal(calls,4);assert.deepEqual(pauses,[10,20,40]);
    assert.equal(JSON.parse(fs.readFileSync(file)).current,'任务开始');
    assert.deepEqual(fs.readdirSync(dir),['state.json']);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('persistent lock is bounded and nonfatal, then next publication recovers',()=>{
  const {dir,file}=fixture();let locked=true,calls=0,warnings=0;
  try {
    const io={...fs,renameSync(from,to){calls++;if(locked)throw sharingError();fs.renameSync(from,to);}};
    const write=createStatusWriter(file,{io,pause:()=>{},onWarning:()=>warnings++});
    assert.equal(write({state:'running'}),false);assert.equal(calls,7);
    assert.equal(write({state:'running'}),false);assert.equal(warnings,1);
    assert.equal(JSON.parse(fs.readFileSync(file)).state,'old');
    assert.deepEqual(fs.readdirSync(dir),['state.json']);
    locked=false;assert.equal(write({state:'completed'}),true);
    assert.equal(JSON.parse(fs.readFileSync(file)).state,'completed');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

function startReader(file,mode,helper) {
  const hold=`$ErrorActionPreference='Stop'; $share=[IO.FileShare]::Read; if($env:ECHOES_TEST_MODE -eq 'shared'){$share=$share -bor [IO.FileShare]::Write -bor [IO.FileShare]::Delete}; $f=[IO.File]::Open($env:ECHOES_TEST_STATUS,[IO.FileMode]::Open,[IO.FileAccess]::Read,$share); try{[Console]::WriteLine('READY'); [Console]::Out.Flush(); Start-Sleep -Milliseconds 300}finally{$f.Dispose()}`;
  const loop=`$ErrorActionPreference='Stop'; . $env:ECHOES_TEST_HELPER; [Console]::WriteLine('READY'); [Console]::Out.Flush(); for($i=0;$i -lt 300;$i++){ $v=Read-SharedText -Path $env:ECHOES_TEST_STATUS | ConvertFrom-Json; if(-not $v.state){throw 'incomplete JSON'}; Start-Sleep -Milliseconds 2 }; [Console]::WriteLine('VALID')`;
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',mode==='loop'?loop:hold],{windowsHide:true,env:{...process.env,ECHOES_TEST_STATUS:file,ECHOES_TEST_MODE:mode,ECHOES_TEST_HELPER:helper||''},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',d=>{stdout+=d;});child.stderr.on('data',d=>{stderr+=d;});
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(Error(stderr||`reader exit ${code}`)));});
  const ready=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(Error('reader not ready'));},10000);
    child.stdout.on('data',()=>{if(stdout.includes('READY')){clearTimeout(timer);resolve();}});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('close',code=>{if(!stdout.includes('READY')){clearTimeout(timer);reject(Error(stderr||`reader exit ${code}`));}});
  });
  // A startup rejection is handled by the caller of ready; prevent an orphan rejection.
  done.catch(()=>{});
  return {child,ready,done};
}

test('real Windows legacy reader reproduces EPERM, new writer recovers', {skip:process.platform!=='win32'},async()=>{
  const {dir,file}=fixture();const reader=startReader(file,'legacy');
  try {
    await reader.ready;
    const temp=path.join(dir,'legacy.tmp');fs.writeFileSync(temp,'{}');
    assert.throws(()=>fs.renameSync(temp,file),e=>['EPERM','EACCES','EBUSY'].includes(e.code));
    fs.unlinkSync(temp);
    const write=createStatusWriter(file);assert.equal(write({state:'running'}),true);
    await reader.done;assert.equal(JSON.parse(fs.readFileSync(file)).state,'running');
  }finally{reader.child.kill();await reader.done.catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
});
test('writer tolerates contention even with a delete-shared Windows reader', {skip:process.platform!=='win32'},async()=>{
  const {dir,file}=fixture();const reader=startReader(file,'shared');
  try {
    await reader.ready;
    assert.equal(createStatusWriter(file)({state:'completed'}),true);
    await reader.done;assert.equal(JSON.parse(fs.readFileSync(file)).state,'completed');
  }finally{reader.child.kill();await reader.done.catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual UI reader parses only complete snapshots during concurrent updates', {skip:process.platform!=='win32'},async()=>{
  const {dir,file}=fixture();const reader=startReader(file,'loop',path.join(__dirname,'../lib/read-shared-text.ps1'));
  try {
    await reader.ready;const write=createStatusWriter(file);
    for(let i=0;i<250;i++){assert.equal(write({state:'running',index:i}),true);await new Promise(r=>setTimeout(r,2));}
    assert.match(await reader.done,/VALID/);
    assert.equal(JSON.parse(fs.readFileSync(file)).index,249);
  }finally{reader.child.kill();await reader.done.catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
});
