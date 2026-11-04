'use strict';
const fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
const {Session}=require('./lib/session');
const {SeaEngine}=require('./lib/sea-engine');
const {SeaPort}=require('./lib/sea-port');
const {createStatusWriter}=require('./lib/status-file');
const {appendSummary}=require('./lib/run-summary');
const ROOT=__dirname, runId=process.argv[2]||randomUUID();
const status=createStatusWriter(path.join(ROOT,'海域运行状态.json'));
const command=path.join(ROOT,'海域命令.json');
// 「行动记录」(运行_认知海域.log) 只放用户能看懂的关键步骤；技术调试详情改写到 运行_认知海域_调试.log。
const debugFile=path.join(ROOT,'运行_认知海域_调试.log');
const actionFile=path.join(ROOT,'运行_认知海域.log');
// exe「执勤简报」面板读的是 运行_摘要.log（NativeTerminal.cs 每 600ms 刷新一次）。
// 此前本运行器的进度只写 运行_认知海域.log，导致面板在整轮认知海域期间空白、停止时才被最终态灌入。
// 故 actionLog 同步追加到 运行_摘要.log，使面板实时刷新（复用调度器的 appendSummary：带时间戳、保留最近 100 行）。
const summaryFile=path.join(ROOT,'运行_摘要.log');
let session, lastState={}, pending=null, debugFd=null;
const originalLog=console.log;
// 写入器：只在 main() 截断日志后打开持久句柄，全程 writeSync 写入。
// 避免每次 appendFileSync 都开/关文件，从而与 GUI 端每 500ms 的读线程
// 在“开文件”瞬间撞车导致 EBUSY（此前正是它让整次运行崩溃）。
// EBUSY/EAGAIN 仅做短暂退避后重试；任何写入失败都静默忽略——日志失败绝不能拖垮 bot。
function writeFd(fd,buf){
  for(let attempt=0;attempt<6;attempt++){
    try{ fs.writeSync(fd,buf,0,buf.length); return; }
    catch(e){
      if(e.code==='EBUSY'||e.code==='EAGAIN'){ try{ Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,8); }catch(_){ } continue; }
      return;
    }
  }
}
// 技术调试日志（带时间戳，仅供排查，不进「行动记录」面板）。
console.log=(...args)=>{
  const line=args.map(a=>typeof a==='string'?a:JSON.stringify(a)).join(' ');
  originalLog(...args);
  if(debugFd===null)return;
  writeFd(debugFd,Buffer.from(new Date().toISOString()+' '+line+'\n','utf8'));
};
// 行动记录：实时追加到 运行_认知海域.log（每次打开-写-关闭，不持久持句柄）。
// 此前为规避 EBUSY 改用持久写句柄，但 exe 读日志用的是默认 FileShare.Read（拒绝写共享），
// 与持久写句柄冲突 → exe 运行中打不开文件、面板完全不刷新，只有进程退出后才读得到（停止后才显示）。
// 改回 appendFileSync + EBUSY 退避重试（与 appendSummary 写 运行_摘要.log 同为瞬开瞬关机制）：
// 绝大多数时刻文件无句柄，exe 以 FileShare.Read 可读到；偶发撞车由重试吸收，不会崩溃。
function actionLog(line){
  const buf=Buffer.from(line+'\n','utf8');
  for(let a=0;a<8;a++){
    try{ fs.appendFileSync(actionFile,buf); break; }
    catch(e){
      if(e.code==='EBUSY'||e.code==='EAGAIN'){ try{ Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10); }catch(_){ } continue; }
      break;
    }
  }
  // 同步实时追加到 运行_摘要.log，让 exe「执勤简报」面板在运行中也能刷新。
  try{ appendSummary(summaryFile,line); }catch(_){ }
}
function report(state,current,extra={}){lastState={runId,state,current,...extra};status(lastState);}
// 把异常转成「行动记录」里给用户看的报错 + 解决建议（不带坐标，保持口语化）。
function describeError(e){
  const m=String(e&&e.message||'未知错误');
  let fix='请查看「运行_认知海域_调试.log」与失败截图「运行失败_认知海域.png」；确认游戏窗口在前台且未被遮挡，然后重新运行本任务。';
  if(/等待超时/.test(m))fix='游戏界面停留在「'+m.replace('等待超时：','')+'」过久。请确认游戏未卡在加载或弹窗，且界面与预期一致；必要时手动回到相应界面后重新运行。';
  else if(/战斗失败|作战失败|挑战失败/.test(m))fix='本场战斗失败。请检查编队与灵感配置是否足以通关，调整后再运行。';
  else if(/未找到指定灵感/.test(m))fix='未在灵感列表中找到目标灵感，可能已选过或列表未刷新。请确认「海域灵感配置.json」的灵感顺序正确。';
  else if(/点击未能生效|未找到可点击目标/.test(m))fix='界面按钮未能被识别或点击。请确认游戏分辨率/缩放为推荐设置，且界面未被遮挡后重新运行。';
  else if(/只打开一个异象回声|多个客户端|残留进程/.test(m))fix='检测到多个异象回声客户端。请结束多余进程（任务管理器）后重试。';
  else if(/下潜未结束|残留下潜|终止下潜|放弃本次探索/.test(m))fix='存在未结束的下潜。可重新运行，终端会自动清理残留下潜后继续。';
  return {msg:m,fix};
}
const channel={
 status:report,
 log:actionLog,
 check(){if(fs.existsSync(path.join(ROOT,'海域停止请求'))){const e=new Error('用户已停止海域任务');e.code='USER_STOP';throw e;}},
 async ask(kind,message,progress){
  pending=randomUUID();report('waiting',message,{...progress,kind,requestId:pending});
  for(;;){session.check();channel.check();let c;try{c=JSON.parse(fs.readFileSync(command,'utf8').replace(/^\uFEFF/,''));}catch(_){}
   if(c?.runId===runId&&c.requestId===pending&&['continue','exit'].includes(c.action)){pending=null;report('running','正在重新检查页面',progress);return c.action;}
   await new Promise(r=>setTimeout(r,200));
  }
 }
};
 async function main(){
  fs.writeFileSync(debugFile,'');fs.writeFileSync(actionFile,'');
  let stopped=false;
  try{ debugFd=fs.openSync(debugFile,'a'); }catch(e){ debugFd=null; }
  report('running','正在准备游戏窗口');actionLog('正在准备游戏窗口');
  session=new Session();const check=session.check.bind(session);session.check=()=>{check();channel.check();};
  const port=new SeaPort(session,channel);
 try{
  await require('./lib/prepare-window').prepareWindow(ROOT,session,'compatible');
  await session.connect();
  await new SeaEngine(port).run();
  report('completed','认知海域任务结束，已返回游戏主页');actionLog('任务完成，已返回游戏主页');
 }catch(e){console.log(e.stack||e.message);stopped=e.code==='USER_STOP'||/用户已停止/.test(e.message);
  if(stopped){
   report('stopped','用户已停止');actionLog('已停止');
  }else{
   const {msg,fix}=describeError(e);
   report('failed',msg);
   actionLog('任务失败：'+msg);
   actionLog('解决方法：'+fix);
  }
  process.exitCode=stopped?0:1;
  if(session?.controller&&!stopped)try{await port.v.capture(path.join(ROOT,'运行失败_认知海域.png'));actionLog('已保存失败截图：运行失败_认知海域.png');}catch(_){}
 }finally{
  // 收尾清理：尽量把下潜干净终止，避免把游戏卡在「下潜中」界面。
  // 用户停止（USER_STOP）时仅终止下潜、不返回游戏主页；正常/异常结束仍退回主页。
  // 清理期间临时关闭停止检测与状态写入，否则用户已点的停止请求会让每一步 check() 再次抛 USER_STOP，
  // 且清理过程中的「终止残留下潜」等状态会覆盖最终「已停止/已完成」结果。
  try{
   if(session&&session.controller){
    const origCheck=channel.check;channel.check=()=>{};
    const origStatus=channel.status;channel.status=()=>{};
    try{ if(stopped)await port.stop(); else await port.home(); }catch(e){ console.log('清理：'+e.message); }
    channel.check=origCheck;channel.status=origStatus;
   }
  }catch(e){ console.log('清理过程异常：'+e.message); }
  if(session)await session.close().catch(e=>console.log('释放资源：'+e.message));
 }
}
main().catch(e=>{report('failed',e.message);process.exitCode=1;});
