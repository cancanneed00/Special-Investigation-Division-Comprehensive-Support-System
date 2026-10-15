const {spawn}=require('child_process');
const path=require('path');

// Keep the worker responsive while PowerShell compiles its Win32 declarations.
// Wait for process close before permitting OCR or reporting completion.
function runPreparation(command,args,{timeout=90000,check=()=>{},onOutput=()=>{}}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let failure=null,stdout='',stderr='',spawnError=null,closed=false;
    const started=Date.now();
    const record=(stream,isError)=>{stream.setEncoding('utf8');stream.on('data',chunk=>{
      if(isError)stderr=(stderr+chunk).slice(-16000);else stdout=(stdout+chunk).slice(-16000);
      onOutput(chunk.trim());
    });};
    record(child.stdout,false);record(child.stderr,true);
    function stop(error){
      if(failure||closed)return;failure=error;
      if(process.platform==='win32' && child.pid){
        const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>child.kill());killer.on('exit',code=>{if(code)child.kill();});
      }else child.kill('SIGKILL');
    }
    const timer=setInterval(()=>{
      try{check();}catch(error){stop(error);return;}
      if(Date.now()-started>=timeout){const error=new Error(`窗口准备超过 ${Math.round(timeout/1000)} 秒，已终止准备进程；最后输出：${(stderr||stdout).trim()||'尚无输出（PowerShell 启动阶段）'}`);error.code='WINDOW_PREPARE_TIMEOUT';stop(error);}
    },100);
    child.on('error',error=>{spawnError=error;});
    child.on('close',(code,signal)=>{
      closed=true;clearInterval(timer);
      if(failure)return reject(failure);
      if(spawnError)return reject(new Error(`窗口准备进程无法启动：${spawnError.code} ${spawnError.message}`));
      if(code!==0)return reject(new Error(`窗口准备失败（退出码 ${code}，信号 ${signal||'无'}）：${(stderr||stdout).trim()||'进程未返回错误文本'}`));
      try{check();resolve({stdout,stderr});}catch(error){reject(error);}
    });
  });
}
function prepareWindow(root,session,inputMode){
  return session.operation('窗口准备',()=>runPreparation('powershell.exe',[
    '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'prepare_game_window.ps1'),'-InputMode',inputMode
  ],{check:()=>session.check(),onOutput:text=>{if(text)console.log(text);}}),105000);
}
module.exports={runPreparation,prepareWindow};
