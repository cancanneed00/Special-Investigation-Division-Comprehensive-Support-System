const {Vision, sleep} = require('./vision');
// 游戏网络请求偶发失败时弹出的系统弹窗（“注意：连接未成功，请点击确定重试”），
// 布局固定：消息居中，右侧金色对号为“确定重试”，左侧为放弃的叉号。
const CONNECTION_DIALOG={pattern:'.*连接未成功.*',roi:[400,250,480,80],retry:[700,370]};
// 返回主页的房子图标会随主题皮肤重绘，故以列表维护：
// 拿到新皮肤后，只需把该皮肤的返回图标截图放进 resource/base/image，并在此数组追加文件名即可，
// 无需改动任何调用点。
const HOME_TEMPLATES=['主界面按钮.png'];
class Flow extends Vision {
  async loading() {
    return await this.template('流程_加载标志.png', [0,570,250,150], 0.76) &&
      await this.template('流程_加载进度条.png',[120,610,1100,110],0.70);
  }
  async click(target, label) {
    if (await this.loading()) {const error=new Error('正在加载，等待重新识别后点击');error.code='PAGE_TRANSITION';throw error;}
    return super.click(target,label);
  }
  async act(probe,expected,label,options){
    return super.act(()=>this.frame(async()=>!await this.loading() && await probe()),expected,label,options);
  }
  async dismissConnectionDialog() {
    const dialog=await this.ocr(CONNECTION_DIALOG.pattern,CONNECTION_DIALOG.roi);
    if(!dialog)return false;
    this.invalidate();
    const [x,y]=CONNECTION_DIALOG.retry;
    const result=await this.s.operation('后台点击',()=>this.s.controller.post_click(x,y).wait());
    if(!result.succeeded)throw new Error('连接未成功确定重试点击发送失败');
    console.log('检测到连接未成功弹窗：已点击确定重试');
    await sleep(500);
    return true;
  }
  // 包装 step 的结果确认：确认未命中时顺带处理连接重试弹窗，让领取类操作
  // 在网络抖动后自动重试，而不是等 15 秒超时失败。
  connectionGuard(expected) {
    return async()=>{
      const hit=await expected();
      if(hit)return hit;
      await this.dismissConnectionDialog();
      return null;
    };
  }
  async step(probe, expected, label, {irreversible=false}={}) {
    // Each wait is bounded; task/session and native-operation deadlines remain
    // active. A second 15-second gate must not preempt slow-frame confirmation.
    return this.act(probe,this.connectionGuard(expected),label,{attempts:irreversible?1:3,timeout:irreversible?14500:3500});
  }
  async textStep(text, expected, label, roi, options) {
    return this.step(()=>this.ocr(text,roi),expected,label,options);
  }
  async dismissReward(expected) {
    return super.dismissReward(expected,{timeout:15000});
  }
  async homeReturn() {
    if (await this.home()) return;
    try {
      await this.step(()=>this.template(HOME_TEMPLATES,[0,0,500,130],0.7),()=>this.home(),'Home 返回主界面');
      return;
    } catch(error) {
      // 主题皮肤可能重绘了返回主页图标，导致模板全部失配；
      // 此时改用通用返回箭头再退一层，仍回不到主页才把错误抛出去。
      if(await this.home())return;
      await this.back(()=>this.home());
    }
  }
  async back(expected) {
    return this.step(()=>this.template('商店_左上返回箭头.png',[0,0,250,130],0.74),expected,'返回上一页');
  }
  async blank(label, guard, x=0.90, y=0.75) {
    const ready=await this.frame(async()=>{
      this.invalidate();
      return await guard() && !await this.reward() && !await this.loading();
    });
    // Transiently missing guard means wait, never guess a click position.
    if(!ready)return false;
    this.s.check();
    const [width,height]=this.size;
    this.invalidate();
    const result=await this.s.operation('关闭过场点击',()=>this.s.controller.post_click(Math.round(width*x),Math.round(height*y)).wait());
    if(!result.succeeded)throw new Error(`空白点击发送失败：${label}`);
    await sleep(500);
    return true;
  }
  async blankUntil(guard, expected, label, options={}) {
    let clicks=0;
    return this.wait(async()=>{
      if(await this.loading())return false;
      if(await this.reward()){await this.rewardClick();return false;}
      const present=await guard();
      if(!present)return expected();
      if(clicks>=20)throw new Error(`关闭点击达到保护上限：${label}`);
      if(await this.blank(label,guard,options.x,options.y)!==false)clicks++;
      return false;
    },`空白关闭后确认：${label}`,{timeout:15000,stable:2});
  }
}
const integer = reco => {
  const text=reco?.detail?.best?.text || '';
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
};
module.exports={Flow,integer,sleep,HOME_TEMPLATES};
