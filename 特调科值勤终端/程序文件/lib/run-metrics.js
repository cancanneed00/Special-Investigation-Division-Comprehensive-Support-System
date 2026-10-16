const fs=require('fs'),path=require('path');
class RunMetrics {
 constructor(root,performance){this.file=path.join(root,'日志记录','性能统计.json');this.started=Date.now();this.cpu=process.cpuUsage();this.config=performance;this.operations={};this.tasks=[];this.lastWrite=0;}
 record(label,ms,failed){const s=this.operations[label]||(this.operations[label]={count:0,totalMs:0,maxMs:0,failed:0});s.count++;s.totalMs+=ms;s.maxMs=Math.max(s.maxMs,ms);s.failed+=failed?1:0;this.flush();}
 task(name,outcome,ms){this.tasks.push({name,outcome,ms});this.flush(true);}
 flush(force=false){
  const now=Date.now();if(!force && now-this.lastWrite<10000)return;this.lastWrite=now;
  try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify({startedAt:new Date(this.started).toISOString(),updatedAt:new Date(now).toISOString(),elapsedMs:now-this.started,requestedPerformance:this.config,workerMemory:process.memoryUsage(),workerCpuMicroseconds:process.cpuUsage(this.cpu),operations:this.operations,tasks:this.tasks,note:'仅终端识别子进程统计，不含游戏或整机负载；provider 为请求值'},null,2));}catch(error){console.log('性能统计写入失败：'+error.message);}
 }
}
module.exports={RunMetrics};
