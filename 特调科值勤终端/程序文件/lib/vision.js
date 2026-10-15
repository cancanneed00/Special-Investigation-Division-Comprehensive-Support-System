const fs = require('fs');
const path = require('path');
const {observe} = require('./performance');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FULL = [0, 0, 1280, 720];
function validateSize(b, {friendFullscreen = false} = {}) {
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') throw new Error('截图不是有效 PNG');
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  const allowedHeight = friendFullscreen ? height >= 700 && height <= 1024 : Math.abs(height - 720) <= 4;
  if (Math.abs(width - 1280) > 4 || !allowedHeight)
    throw new Error(`后台截图实际为 ${width}×${height}，超出 1280×720 的 4 像素容差；请退出全屏后重试`);
  return [width, height];
}
class Vision {
  constructor(session) { this.s = session; }
  async frame(probe) {
    if(this.frameActive)return probe();
    this.frameActive=true;this.frameImage=null;this.frameResults=new Map();
    try{return await probe();}
    finally{this.frameActive=false;this.frameImage=null;this.frameResults=null;}
  }
  invalidate() {this.frameImage=null;this.frameResults?.clear();}
  async capture(file) {
    this.s.check();
    const started=Date.now();
    const image = await this.s.operation('后台截图',()=>this.s.controller.post_screencap().wait().get());
    this.captureMs=Date.now()-started;
    if (!image) throw new Error('后台截图失败，停止操作');
    const b = Buffer.from(image);
    if (file) fs.writeFileSync(file, b);
    try { this.size = validateSize(b, {friendFullscreen: this.s.friendFullscreen === true}); }
    catch (error) {
      const path = require('path');
      fs.writeFileSync(path.join(__dirname, '..', '启动检查_尺寸异常.png'), b);
      throw error;
    }
    this.lastImage=b;
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
  async recognize(type, param) {
    this.s.check();
    const key=JSON.stringify([type,param]);
    if(this.frameActive && this.frameResults.has(key))return this.frameResults.get(key);
    const image=this.frameActive && this.frameImage ? this.frameImage : await this.capture();
    if(this.frameActive)this.frameImage=image;
    this.pendingRecognition={type,param,startedAt:new Date().toISOString()};
    this.saveDiagnostic();
    const started=Date.now();
    const reco=await this.s.operation(type==='OCR'?'OCR 识别':'模板识别',async()=>{
      const job = await this.s.tasker.post_recognition(type, param, image).wait();
      const result = await job.get();
      const node = result?.nodes?.[0] ? this.s.tasker.node_detail(result.nodes[0]) : null;
      return node?.reco || null;
    });
    this.lastRecognition={type,param,captureMs:this.captureMs,recognitionMs:Date.now()-started,requestedProvider:this.s.performance.provider,detail:reco?.detail||null};
    this.pendingRecognition=null;
    this.diagnosticHistory=this.diagnosticHistory||[];
    this.diagnosticHistory.push(this.lastRecognition);
    if(this.diagnosticHistory.length>12)this.diagnosticHistory.shift();
    // Keep the exact input and result of the latest operation for a stuck worker too.
    this.saveDiagnostic();
    this.s.check();
    const answer=reco?.hit && reco.detail?.best ? reco : null;
    if(this.frameActive)this.frameResults.set(key,answer);
    return answer;
  }
  saveDiagnostic(label) {
    try {
      const dir=path.join(__dirname,'..','日志记录','诊断');
      fs.mkdirSync(dir,{recursive:true});
      // One bounded rolling input, shared across checks of the same frame.
      fs.writeFileSync(path.join(dir,'最近识别.json'),JSON.stringify({at:new Date().toISOString(),label,pending:this.pendingRecognition,history:this.diagnosticHistory},null,2));
      if(this.lastImage && this.diagnosticImage!==this.lastImage) {
        fs.writeFileSync(path.join(dir,'最近识别截图.png'),this.lastImage);
        this.diagnosticImage=this.lastImage;
      }
      if(label) {
        fs.copyFileSync(path.join(dir,'最近识别.json'),path.join(dir,'最近失败.json'));
        if(this.lastImage)fs.writeFileSync(path.join(dir,'最近失败截图.png'),this.lastImage);
      }
    }catch(error){console.log('诊断记录写入失败：'+error.message);}
  }
  ocr(expected, roi = FULL) { return this.recognize('OCR', {expected, roi, order_by:'Vertical'}); }
  template(template, roi = FULL, threshold = 0.78) {
    return this.recognize('TemplateMatch', {template, roi, threshold});
  }
  async wait(probe, label, {timeout = 15000, stable = 2, now = Date.now, pause = sleep} = {}) {
    const waitStart = now();
    let end = waitStart + timeout * this.slowScale;
    // Page transition allowance plus a bounded budget for completing stable
    // recognition frames. Previously two valid slow frames could never fit.
    const hardEnd=waitStart+timeout*8+stable*(this.s.performance.operationTimeoutMs||60000);
    let n = 0, result, longestProbe=0;
    while (now() < end) {
      this.s.check();
      const started=now();
      result = await this.frame(probe);
      longestProbe=Math.max(longestProbe,now()-started);
      observe(this.s,now()-started);
      const interval=Math.max(this.s.performance.pollMs,150*this.slowScale);
      // Anchored at waitStart: retries do not slide the deadline forward forever.
      end=Math.min(hardEnd,Math.max(end,waitStart+timeout*this.slowScale+stable*longestProbe+(stable-1)*interval));
      this.s.check();
      if(now()>end)break;
      n = result ? n + 1 : 0;
      if (n >= stable) return result;
      await pause(interval);
    }
    this.saveDiagnostic(label);
    const error = new Error(`结果未确认：${label}（耗时 ${Math.round((now()-waitStart)/1000)} 秒，连续确认 ${n}/${stable}，单轮识别最长 ${Math.round(longestProbe/1000)} 秒）`);
    error.code = 'RESULT_TIMEOUT';
    throw error;
  }
  get slowScale() {
    // 最近多轮探测耗时给出的有界倍率。
    return this.s.slowScale || 1;
  }
  async click(reco, label) {
    this.s.check();
    const box = reco?.detail?.best?.box;
    if (!box || box.length !== 4 || box.some(n => !Number.isFinite(n))) throw new Error(`缺少识别框：${label}`);
    const [x,y,w,h] = box;
    const [width,height] = this.size || [1280,720];
    if (w <= 0 || h <= 0 || x < 0 || y < 0 || x+w > width || y+h > height) throw new Error('识别框越界');
    this.invalidate();
    if (!(await this.s.operation('后台点击',()=>this.s.controller.post_click(Math.round(x+w/2), Math.round(y+h/2)).wait())).succeeded)
      throw new Error(`后台点击发送失败：${label}`);
    console.log(`识别后点击：${label} ${JSON.stringify(box)}`);
    await sleep(150);
  }
  async act(probe, expected, label, {attempts = 1, timeout = 15000} = {}) {
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('重试次数必须为 1–3');
    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.s.check();
      // Only callers explicitly declaring a reversible action may retry.
      if (attempt > 1 && await expected()) {
        return this.wait(expected, label, {timeout});
      }
      const target = await this.wait(probe, `${label}按钮`, {stable:1});
      if (attempt > 1 && await expected()) return this.wait(expected, label, {timeout});
      await this.click(target, `${label}（${attempt}/${attempts}）`);
      try {
        const result = await this.wait(expected, label, {timeout});
        console.log(`操作结果已确认：${label}`);
        return result;
      } catch (error) {
        this.s.check();
        if (error.code !== 'RESULT_TIMEOUT' || attempt === attempts) throw error;
        console.log(`操作结果未确认：${label}；重新识别按钮后重试 ${attempt + 1}/${attempts}`);
      }
    }
  }
  reward() { return this.ocr('.*获取物资.*', [200, 20, 880, 250]); }
  async rewardClick() {
    if (!await this.reward()) throw new Error('未确认获取物资弹层，不点击对号');
    const button = await this.wait(async () =>
      await this.template(["奖励对号_核心_90.png", "奖励对号_核心_100.png", "奖励对号_核心_110.png", "通用_奖励对号.png"], [200, 430, 880, 290], 0.80) ||
      await this.template('领取确认_对号.png', [200, 430, 880, 290], 0.78) ||
      await this.template('领取确认_对号_可见上半部.png', [200, 430, 880, 290], 0.80),
    '获取物资底部对号', {stable:1, timeout:6000});
    await this.click(button, '获取物资底部对号');
  }
  async dismissReward(expected, {timeout = 25000} = {}) {
    return this.wait(async()=>{
      if(await this.reward()){await this.rewardClick();return false;}
      return expected();
    },'获取物资关闭并返回预期页面',{timeout,stable:2});
  }
  async home() {
    return this.frame(async()=>{
      // Verified against the bundled 1280x720 home screenshot. Both labels lie
      // in the right/lower panel; full-screen friend mode uses the original extent.
      const roi=this.s.friendFullscreen ? FULL : [760,260,520,460];
      const reco=await this.ocr('.*',roi);
      const all=reco?.detail?.all;
      if(!Array.isArray(all))return false;
      const texts=all.map(x=>String(x.text||''));
      if(texts.some(x=>/获取物资/.test(x)))return false;
      return texts.some(x=>/^作战$/.test(x)) && texts.some(x=>/^.?任务$/.test(x)) && !await this.reward();
    });
  }
  supportCabinet() { return this.ocr('^支援货柜$', [70,290,140,85]); }
  async shop() {
    return this.frame(async()=>{
      const marker=await this.supportCabinet();
      return marker && !await this.reward() ? marker : null;
    });
  }
  async closeKnownResult() {
    if (await this.reward()) { await this.rewardClick(); return; }
    const target = await this.ocr('^(确定|确认|跳过|继续|点击.*继续|.*点击.*关闭.*)$', [0, 0, 1280, 720]);
    if (target) { await this.click(target, '结果页按钮或提示'); return; }
    // Unknown animation: wait, never click an arbitrary point.
    await sleep(150);
  }
}
module.exports = { Vision, sleep, FULL, validateSize };
