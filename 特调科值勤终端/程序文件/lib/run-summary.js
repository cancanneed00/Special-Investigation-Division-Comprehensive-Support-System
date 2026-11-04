const fs=require('fs');
function importantLine(text){
 const first=String(text).split(/\r?\n/)[0];
 if(!/^(开始：|完成并验证：|任务失败：|两个优先类型均缺货|缺货退出已确认|黑胶上限)/.test(first))return null;
 return first.replace('完成并验证：','完成：').replace(/ Error: /,' · ').slice(0,240);
}
function appendSummary(file,text){
 const line=`[${new Date().toLocaleTimeString('zh-CN',{hour12:false})}] ${String(text).split(/\r?\n/)[0].slice(0,240)}`;
 // Windows 上日志文件可能被编辑器/杀软瞬时独占（EBUSY）。同步重试数次，仍失败则放弃本条摘要（完整日志仍在 运行_UI.log），绝不让终端整体崩溃。
 for(let attempt=0;attempt<5;attempt++){
  try{
   const lines=fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\n').filter(Boolean):[];
   lines.push(line);
   fs.writeFileSync(file,lines.slice(-100).join('\n')+'\n');
   return;
  }catch(error){
   if(attempt===4)return;
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150*(attempt+1));
  }
 }
}
module.exports={importantLine,appendSummary};
