const fs = require('fs');
const path = require('path');
const { Session, ROOT } = require('./lib/session');
const { Vision } = require('./lib/vision');
const { recover } = require('./lib/navigation');
const { verifyInput } = require('./lib/input-check');
const TASKS = [
  ['shop_daily','商店每日奖励','run_shop_daily_reward.js',180000],
  ['office_interpret','事务所解读与分解','run_office_interpret.js',900000],
  ['crisis_action','危机行动','run_crisis_action.js',240000],
  ['stamina_clear','清体力','run_stamina_clear.js',600000],
  ['task_rewards','领取任务奖励','run_task_rewards.js',300000],
  ['external_recruit','外部招募','run_external_recruit.js',240000],
];
const STATUS = path.join(ROOT,'运行_UI状态.json');
const LOG = path.join(ROOT,'运行_UI.log');
const SUMMARY=path.join(ROOT,'运行_摘要.log');
const {importantLine,appendSummary}=require('./lib/run-summary');
const {cleanupLogs}=require('./lib/log-retention');
const {createStatusWriter}=require('./lib/status-file');
const writeStatus=createStatusWriter(STATUS,{onWarning:message=>{
  console.log(message);
  try{appendSummary(SUMMARY,message);}catch(_){}
}});
function status(value) {
  const published=writeStatus(value);
  if(['failed','stopped','completed','completed_with_skips'].includes(value.state)) {
    try{appendSummary(SUMMARY,value.current);}catch(error){console.error('简报更新失败：'+error.message);}
  }
  return published;
}
function plan(config) {
  if (!Array.isArray(config.tasks) || !config.tasks.length) throw new Error('请至少选择一项任务');
  if (config.tasks.some(id => !TASKS.some(t => t[0]===id))) throw new Error('存在未知任务');
  return TASKS.filter(t=>config.tasks.includes(t[0]));
}
async function main() {
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'启动配置.json'),'utf8').replace(/^\uFEFF/,''));
  config.inputMode='compatible';
  config.office={first:'星砂',second:'金钱',...(config.office||{}),count:'all'};
  config.stamina='红币';
  const tasks=plan(config);
  if(config.inputMode && !['strict','compatible'].includes(config.inputMode))throw new Error('未知输入模式');
  if(process.argv.includes('--dry-run')) {console.log(tasks.map(t=>t[1]).join(' → '));return;}
  const office=config.office||{};
  if(tasks.some(t=>t[0]==='office_interpret')) {
    const choices=['金钱','经验','星砂','材料'];
    if(!choices.includes(office.first)||!choices.includes(office.second)||office.first===office.second||![1,3,'all'].includes(office.count))
      throw new Error('事务所优先级或解读数量无效');
    fs.writeFileSync(path.join(ROOT,'事务所配置.json'),JSON.stringify({'第一优先':office.first,'第二优先':office.second,'解读数量':office.count}));
  }
  if(tasks.some(t=>t[0]==='stamina_clear')) {
    fs.writeFileSync(path.join(ROOT,'清体力配置.json'),JSON.stringify({'刷取目标':config.stamina}));
  }
  const lock=path.join(ROOT,'运行锁.json');
  if(fs.existsSync(lock)) {
    const pid=JSON.parse(fs.readFileSync(lock,'utf8')).pid;
    let alive=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
    if(alive)throw new Error('已有终端任务正在运行，请先停止');
    fs.unlinkSync(lock);
  }
  const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);
  fs.mkdirSync(path.join(ROOT,'日志记录'),{recursive:true});
  if(fs.existsSync(LOG))fs.copyFileSync(LOG,path.join(ROOT,'日志记录',`运行_${Date.now()}.log`));
  const archives=fs.readdirSync(path.join(ROOT,'日志记录')).filter(x=>/^运行_\d+\.log$/.test(x)).sort().reverse();
  for(const file of archives.slice(20))fs.unlinkSync(path.join(ROOT,'日志记录',file));
  fs.writeFileSync(LOG,'');
  cleanupLogs(ROOT);
  fs.writeFileSync(SUMMARY,'');
  appendSummary(SUMMARY,'正在准备游戏与连接检查');
  const original=console.log;
  console.log=(...args)=>{const message=args.join(' ');const text=`[${new Date().toISOString()}] ${message}`;fs.appendFileSync(LOG,text+'\n');const brief=importantLine(message);if(brief)appendSummary(SUMMARY,brief);original(text);};
  const session=new Session(undefined, config.inputMode || 'compatible');
  const skipped=[];
  // A hung native operation must terminate the whole owner process, never overlap recovery with it.
  let hardTimer;
  try {
    session.check();
    status({state:'running',current:'连接与后台检查'});
    if(fs.existsSync(path.join(ROOT,'临时全屏恢复.json')))await require('./lib/friend-window').changeWindow('restore');
    await require('./lib/prepare-window').prepareWindow(ROOT,session,config.inputMode || 'compatible');
    // 慢机器（无 GPU、OCR 走 CPU）上启动检查加输入验证可能需要数分钟，放宽硬时限；
    // 快机器上验证一通过即 clearTimeout，不影响原有节奏。
    hardTimer=setTimeout(()=>{status({state:'failed',current:'连接或后台输入检查超时，已停止'});process.exit(2);},300000);
    await session.connect();
    const v=new Vision(session);
    try {
      await v.capture(path.join(ROOT,'启动检查_操作前.png'));
      await v.wait(()=>v.home(),'启动时主界面', {timeout:12000});
    } catch(error) {
      try {await v.capture(path.join(ROOT,'启动检查_失败.png'));}catch(captureError){console.log('启动截图保存失败：'+captureError.message);}
      console.log('启动主页未确认：请先让游戏进入含招募、补给站、事务所等菜单的主界面；诊断截图位于程序文件/启动检查_操作前.png 与 启动检查_失败.png');
      throw error;
    }
    status({state:'running',current:'验证后台点击：进入商店并返回主页'});
    await v.capture(path.join(ROOT,'后台输入检查_操作前.png'));
    try { await verifyInput(v); }
    catch(error) {
      try {await v.capture(path.join(ROOT,'后台输入检查_失败.png'));}catch(_){}
      throw error;
    }
    clearTimeout(hardTimer);
    for(let i=0;i<tasks.length;i++) {
      const [id,name,script,timeout]=tasks[i];
      const taskStarted=Date.now();
      const scale=Math.max(v.slowScale,session.peakSlowScale||1); // 固定任务预算采用已观察到的慢机倍率，避免被一次快速检查压缩。
      session.setBudget(timeout,scale);
      status({state:'running',current:name,index:i+1,total:tasks.length});
      console.log(`开始：${name}`);
      hardTimer=setInterval(()=>{session.refreshBudget();if(Date.now()>session.deadline+15000){status({state:'failed',current:`${name} 超过安全时限，已停止`});process.exit(2);}},250);
      try {
        await require('./'+script).run(session);
        await v.wait(()=>v.home(),`${name} 结束后主界面`);
        session.metrics?.task(name,'completed',Date.now()-taskStarted);
        console.log(`完成并验证：${name}`);
      } catch(error) {
        session.metrics?.task(name,'failed',Date.now()-taskStarted);
        console.log(`任务失败：${name} ${error.stack||error}`);
        if(fs.existsSync(path.join(ROOT,'停止请求')))throw error;
        const recoveryMs=require('./lib/performance').recoveryBudget(session);
        session.setBudget(recoveryMs,1,false);
        clearTimeout(hardTimer);
        hardTimer=setTimeout(()=>{status({state:'failed',current:'恢复超时，已停止'});process.exit(2);},recoveryMs+15000);
        try{await v.capture(path.join(ROOT,`运行失败_${id}.png`));}catch(_){}
        if(error.code==='FRIEND_FULLSCREEN_CLOSE_FAILED')throw error;
        status({state:'recovering',current:name,reason:error.message});
        try { if(['external_recruit','shop_daily'].includes(id)) {
          const {Flow}=require('./lib/flow');
          const recovery=new Flow(session);
          if(await recovery.reward())await recovery.rewardClick();
          const cancel=await recovery.ocr('^取消$',[200,180,850,450]);
          if(cancel)await recovery.click(cancel,'关闭未完成的数量弹窗');
          await recovery.homeReturn();
        } else await recover(session,{taskId:id});
        }catch(recoveryError){throw new Error(`${name}失败：${error.message}；返回主页未完成：${recoveryError.message}`,{cause:recoveryError});}
        skipped.push({task:name,reason:error.message});
      } finally {clearTimeout(hardTimer);session.clearBudget();}
    }
    if(skipped.length===tasks.length)throw new Error('所有选定任务均失败，未完成任何任务；请检查日志');
    status({state:skipped.length?'completed_with_skips':'completed',current:skipped.length?`结束，跳过 ${skipped.length} 项`:'全部任务完成',skipped});
  } finally {
    clearTimeout(hardTimer);
    session.clearBudget();
    await session.close();
    cleanupLogs(ROOT);
    console.log=original;
    fs.rmSync(lock,{force:true});
  }
}
if(require.main===module && process.env.ECHOES_WORKER!=='1' && !process.argv.includes('--dry-run')) {
  require('./lib/supervisor').supervise(__filename,ROOT).then(code=>process.exit(code)).catch(error=>{console.error(error);process.exit(2);});
} else if(require.main===module)main().then(()=>process.exit(0)).catch(error=>{
  const stopped=fs.existsSync(path.join(ROOT,'停止请求'));
  status({state:stopped?'stopped':'failed',current:stopped?'用户已停止':error.message});
  fs.appendFileSync(LOG,`\n运行停止：${error.stack||error}\n`);
  console.error(error);process.exit(stopped?0:2);
});
module.exports={main,plan,TASKS};
