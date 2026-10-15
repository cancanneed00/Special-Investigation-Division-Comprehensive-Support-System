const {Vision, sleep} = require('./vision');
class Flow extends Vision {
  async loading() {
    return await this.template('流程_加载标志.png', [0,570,250,150], 0.76) &&
      await this.template('流程_加载进度条.png',[120,610,1100,110],0.70);
  }
  async click(target, label) {
    if (await this.loading()) throw new Error('正在加载，禁止点击');
    return super.click(target,label);
  }
  async step(probe, expected, label, {irreversible=false}={}) {
    // Each wait is bounded; task/session and native-operation deadlines remain
    // active. A second 15-second gate must not preempt slow-frame confirmation.
    return this.act(probe,expected,label,{attempts:irreversible?1:3,timeout:irreversible?14500:3500});
  }
  async textStep(text, expected, label, roi, options) {
    return this.step(()=>this.ocr(text,roi),expected,label,options);
  }
  async dismissReward(expected) {
    return super.dismissReward(expected,{timeout:15000});
  }
  async homeReturn() {
    if (await this.home()) return;
    await this.step(()=>this.template('主界面按钮.png',[0,0,500,130],0.7),()=>this.home(),'Home 返回主界面');
  }
  async back(expected) {
    return this.step(()=>this.template('商店_左上返回箭头.png',[0,0,250,130],0.74),expected,'返回上一页');
  }
  async blank(label, guard, x=0.90, y=0.75) {
    if (!await guard() || await this.reward() || await this.loading()) throw new Error(`不满足空白关闭条件：${label}`);
    await this.capture(); this.s.check();
    const [width,height]=this.size;
    this.invalidate();
    const result=await this.s.operation('关闭过场点击',()=>this.s.controller.post_click(Math.round(width*x),Math.round(height*y)).wait());
    if(!result.succeeded)throw new Error(`空白点击发送失败：${label}`);
    await sleep(500);
  }
  async blankUntil(guard, expected, label, options={}) {
    let clicks=0;
    return this.wait(async()=>{
      if(await this.reward()){await this.rewardClick();return false;}
      const present=await guard();
      if(!present)return expected();
      if(clicks>=20)throw new Error(`关闭点击达到保护上限：${label}`);
      await this.blank(label,guard,options.x,options.y);clicks++;
      return false;
    },`空白关闭后确认：${label}`,{timeout:15000,stable:2});
  }
}
const integer = reco => {
  const text=reco?.detail?.best?.text || '';
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
};
module.exports={Flow,integer,sleep};
