const fs=require('fs');
const path=require('path');
const {fork,spawn}=require('child_process');
const {createStatusWriter}=require('./status-file');
function supervise(entry, root, {args=process.argv.slice(2),stopFile=path.join(root,'停止请求'),initialTimeout=300000}={}) {
  const child=fork(entry,args,{cwd:root,env:{...process.env,ECHOES_WORKER:'1'},stdio:['inherit','inherit','inherit','ipc'],windowsHide:true});
  let deadline=Date.now()+initialTimeout,label='启动准备',reason=null,killing=false;
  child.on('message',m=>{
    if(m?.kind==='operation-start') {label=m.label;deadline=Date.now()+Math.min(120000,Math.max(100,m.timeout));}
    if(m?.kind==='operation-end') {label='流程响应';deadline=Date.now()+initialTimeout;}
  });
  function terminate(message) {
    if(killing)return;killing=true;reason=message;
    if(process.platform==='win32') {
      const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      killer.on('error',()=>child.kill());
      killer.on('exit',code=>{if(code)child.kill();});
    } else child.kill('SIGKILL');
  }
  const timer=setInterval(()=>{
    if(fs.existsSync(stopFile))terminate('用户已停止');
    else if(Date.now()>deadline)terminate(`${label}超时，识别进程已停止；请查看诊断记录`);
  },250);
  child.on('error',error=>{reason='识别进程启动失败：'+error.message;});
  return new Promise(resolve=>child.on('close',code=>{
    clearInterval(timer);
    if(reason) {
      const diagnostics=path.join(root,'日志记录','诊断');
      for(const [from,to] of [['最近识别.json','最近失败.json'],['最近识别截图.png','最近失败截图.png']]) {
        try{fs.copyFileSync(path.join(diagnostics,from),path.join(diagnostics,to));}catch(_){}
      }
      const stopped=reason==='用户已停止';
      const status={state:stopped?'stopped':'failed',current:reason,updatedAt:new Date().toISOString()};
      createStatusWriter(path.join(root,'运行_UI状态.json'))(status);
      for(const name of ['运行_UI.log','运行_摘要.log']) {
        try{fs.appendFileSync(path.join(root,name),'\n'+reason+'\n');}catch(error){console.error('日志更新失败：'+error.message);}
      }
      // Remove only this worker's lock, after its process has exited.
      const lock=path.join(root,'运行锁.json');
      try {if(JSON.parse(fs.readFileSync(lock,'utf8')).pid===child.pid)fs.unlinkSync(lock);}catch(_){}
      resolve(stopped?0:2);
    }else resolve(code===0?0:2);
  }));
}
module.exports={supervise};
