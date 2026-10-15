const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('path');
const {runPreparation}=require('../lib/prepare-window');
test('slow startup beyond old fifteen-second limit succeeds and reports progress',{timeout:25000},async()=>{
 const chunks=[];const start=Date.now();
 const result=await runPreparation(process.execPath,['-e',"console.log('loading');setTimeout(()=>console.log('ready'),16000)"],{onOutput:text=>chunks.push(text)});
 assert.ok(Date.now()-start>=16000);assert.match(result.stdout,/ready/);assert.ok(chunks.includes('loading'));
});
test('hung preparation terminates within its bound with last stage in error',async()=>{
 await assert.rejects(runPreparation(process.execPath,['-e',"console.log('loading APIs');setInterval(()=>{},1000)"],{timeout:700}),error=>error.code==='WINDOW_PREPARE_TIMEOUT'&&/loading APIs/.test(error.message));
});
test('stop request interrupts preparation and preserves stop reason',async()=>{
 const start=Date.now();await assert.rejects(runPreparation(process.execPath,['-e','setInterval(()=>{},1000)'],{check:()=>{if(Date.now()-start>300)throw Error('用户已停止任务');}}),/用户已停止任务/);
});
test('failed process exposes exit code and error text',async()=>{
 await assert.rejects(runPreparation(process.execPath,['-e',"console.error('window unavailable');process.exit(7)"]),/退出码 7.*window unavailable/);
});
test('missing executable reports startup error',async()=>{
 await assert.rejects(runPreparation('echoes-nonexistent-executable-228.exe',[]),/无法启动.*ENOENT/);
});
test('real PowerShell compiles Windows API declarations without touching game',{skip:process.platform!=='win32'},async()=>{
 const result=await runPreparation('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve(__dirname,'../prepare_game_window.ps1'),'-CheckApiOnly']);
 assert.match(result.stdout,/Windows 接口加载完成/);assert.doesNotMatch(result.stdout,/正在查找游戏窗口/);
});
