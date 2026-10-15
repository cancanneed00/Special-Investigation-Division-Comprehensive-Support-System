const { sleep } = require('./vision');

// Empty-area clicks are explicitly allowed only in the animation following
// a recognized 招募成功 action. Reward overlays always use their checkmark.
async function finishRecruitResult(v, pageMarker, {
  animationAllowed = false, pause = sleep, maxSteps = 90, timeout = 15000,
} = {}) {
  const end=Date.now()+timeout*(v.slowScale||1);
  let rewardSeen = false, pageFrames = 0, absentFrames = 0, blankClicks = 0;
  for (let step = 0; step < maxSteps && Date.now()<end; step++) {
    v.s.check();
    if (await v.reward()) {
      rewardSeen = true;
      pageFrames = 0;
      absentFrames = 0;
      await v.rewardClick();
      await pause(450);
      continue;
    }
    const page = await pageMarker();
    if (page) {
      absentFrames = 0;
      if (rewardSeen && ++pageFrames >= 2) return;
      // Do not click the underlying recruitment controls during slow transitions.
      await pause(450);
      continue;
    }
    pageFrames = 0;
    if (await v.home()) throw new Error('招募结果未确认却回到了主页，停止动画点击');
    if (!animationAllowed) {
      await pause(450);
      continue;
    }
    if (++absentFrames < 2) { await pause(450); continue; }
    const skip = await v.ocr('.*(跳过|点击.*继续|点击.*空白).*');
    if (skip) await v.click(skip, '跳过招募动画提示');
    else {
      if (blankClicks >= 30) throw new Error('招募动画空白跳过达到保护上限');
      // Refresh immediately before the only deliberate non-button click.
      if (await v.reward() || await pageMarker()) continue;
      await v.capture();
      v.s.check();
      const [width,height] = v.size;
      const x = Math.round(width * 0.90), y = Math.round(height * 0.90);
      v.invalidate();
      if (!(await v.s.operation('招募动画点击',()=>v.s.controller.post_click(x,y).wait())).succeeded)
        throw new Error('招募动画空白区域点击发送失败');
      blankClicks++;
      console.log(`招募动画：空白跳过 ${blankClicks}/30，等待获取物资`);
    }
    await pause(550);
  }
  throw new Error(rewardSeen ? '已处理奖励，但未确认返回外部招募页' : '招募动画后未出现获取物资，未确认领取成功');
}
module.exports = { finishRecruitResult };
