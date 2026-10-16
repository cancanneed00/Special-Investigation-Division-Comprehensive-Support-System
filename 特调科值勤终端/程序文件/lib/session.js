const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
class Session {
  constructor(maa = require('../node_modules/@maaxyz/maa-node'), inputMode = 'compatible') {
    if (!['strict', 'compatible'].includes(inputMode)) throw new Error('未知输入模式');
    this.inputMode = inputMode;
    this.maa = maa;
    this.performance = require('./performance').loadPerformance(ROOT);
    this.slowScale = this.performance.mode === 'low' ? 2 : 1;
    this.deadline = Infinity;
    this.closed = false;
    this.metrics = new (require('./run-metrics').RunMetrics)(ROOT,this.performance);
  }
  setBudget(baseMs,scale=1,adaptive=true) {
    this.budget={started:Date.now(),baseMs,scale,adaptive};this.refreshBudget();
  }
  refreshBudget() {
    if(!this.budget)return;
    const b=this.budget,scale=b.adaptive?Math.min(8,Math.max(b.scale,this.peakSlowScale||1,this.slowScale||1)):b.scale;
    const deadline=b.started+b.baseMs*scale;
    if(deadline!==this.deadline){this.deadline=deadline;if(process.send)process.send({kind:'task-deadline',deadline});}
  }
  clearBudget(){this.budget=null;this.deadline=Infinity;if(process.send)process.send({kind:'task-deadline',deadline:null});}
  check() {
    this.refreshBudget();
    if (fs.existsSync(path.join(ROOT, '停止请求'))) throw new Error('用户已停止任务');
    if (Date.now() > this.deadline) throw new Error('当前任务超过安全时限');
    if (this.closed) throw new Error('窗口会话已关闭');
  }
  async operation(label, fn, timeout = this.performance.operationTimeoutMs) {
    if(label!=='释放识别资源')this.check();
    const start=Date.now();
    if(process.send)process.send({kind:'operation-start',label,timeout});
    let failed=true;
    try {const result=await fn();if(label!=='释放识别资源')this.check();failed=false;return result;}
    finally {
      if(process.send)process.send({kind:'operation-end'});
      this.lastOperation={label,ms:Date.now()-start};
      this.metrics?.record(label,this.lastOperation.ms,failed);
    }
  }
  async connect() {
    return this.operation('连接及模型加载',()=>this.connectNative(),120000);
  }
  async connectNative() {
    if (this.controller) return this;
    const m = this.maa;
    m.Global.config_init_option(path.join(ROOT, '日志记录', 'maa'));
    m.Global.save_draw=false;
    m.Global.save_on_error=true;
    // Maa Node 5.13.1's native uint64_t binding requires a decimal string,
    // despite global.d.ts declaring this property as number.
    m.Global.reco_image_cache_limit='8';
    const matches = (await m.Win32Controller.find()).filter(x => x[1] === 'UnityWndClass' && x[2] === '异象回声');
    if (matches.length !== 1) throw new Error(`应只打开一个异象回声客户端，当前找到 ${matches.length} 个`);
    this.controller = new m.Win32Controller(matches[0][0], m.Win32ScreencapMethod.Background,
      this.inputMode === 'compatible' ? m.Win32InputMethod.PostMessageWithWindowPos : m.Win32InputMethod.AnchoredTouch,
      m.Win32InputMethod.PostMessage);
    if (!(await this.controller.post_connection().wait()).succeeded || !this.controller.connected)
      throw new Error('后台窗口连接失败，请检查游戏与终端的权限是否一致');
    this.controller.screenshot_target_long_side = 1280;
    this.resource = new m.Resource();
    // Auto follows Maa's selection policy; explicit providers permit comparison
    // on machines where GPU contention or driver stability differs.
    this.resource.inference_device = this.performance.provider === 'CPU' ? 'CPU' : 'Auto';
    this.resource.inference_execution_provider = this.performance.provider;
    console.log(`性能模式：${this.performance.mode}；请求推理后端：${this.performance.provider}；单次调用上限：${this.performance.operationTimeoutMs}ms（实际后端见 Maa 日志）`);
    if (!(await this.resource.post_bundle(path.join(ROOT, 'resource/base')).wait()).succeeded)
      throw new Error('识别资源加载失败');
    this.tasker = new m.Tasker();
    this.tasker.controller = this.controller;
    this.tasker.resource = this.resource;
    if (!this.tasker.inited) throw new Error('识别器初始化失败');
    console.log(this.inputMode === 'compatible'
      ? '兼容输入已连接：会短暂移动游戏窗口，不保证前台鼠标独立；尚待实际导航验证'
      : '独立鼠标模式已连接：AnchoredTouch；此游戏此前未响应，尚待实际导航验证');
    return this;
  }
  async close() {
    try{return await this.operation('释放识别资源',()=>this.closeNative(),15000);}
    finally{this.metrics?.flush(true);}
  }
  async closeNative() {
    if (this.closed) return;
    this.closed = true;
    if (this.tasker?.running) await this.tasker.post_stop().wait();
    this.tasker?.destroy();
    this.resource?.destroy();
    this.controller?.destroy();
  }
}
module.exports = { Session, ROOT };
