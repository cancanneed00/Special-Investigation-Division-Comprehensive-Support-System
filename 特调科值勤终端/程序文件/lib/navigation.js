const { Flow: Vision, sleep, HOME_TEMPLATES } = require('./flow');
async function recover(session,{taskId}={}) {
  const v = new Vision(session);
  if(taskId==='office_interpret' && await require('./office-flow').recoverArchive(v))return;
  for (let i=0; i<20; i++) {
    if(await v.loading()){await v.wait(async()=>!await v.loading(),'等待加载结束',{timeout:40000});continue;}
    if(taskId==='stamina_clear' && await require('./corridor-result').corridorResult(v)) {
      const result=()=>require('./corridor-result').corridorResult(v);
      await v.blankUntil(result,async()=>!await result() &&
        (await v.ocr('^扫荡$',[850,570,300,150]) || await v.home()),
        '关闭回廊结算',{x:0.90,y:0.60});
      continue;
    }
    if (await v.ocr('^冥想日志$', [300,0,680,180])) {
      await v.blankUntil(()=>v.ocr('^冥想日志$', [300,0,680,180]),async()=>!await v.ocr('^冥想日志$', [300,0,680,180]),'冥想日志消失',{x:0.93,y:0.82});
      continue;
    }
    if (await v.reward()) { await v.rewardClick(); continue; }
    if (await v.home()) { await v.wait(() => v.home(), '返回主界面'); return; }
    const quantity = await v.ocr('^分解数量$');
    const warehouse = await v.ocr('(仓库|库存).*[/／].*', [600,0,680,160]);
    if (quantity || warehouse) {
      await v.step(() => v.ocr('^取消$', quantity ? [200,390,450,150] : [600,580,680,140]),
        async () => quantity ? !await v.ocr('^分解数量$') : !await v.ocr('(仓库|库存).*[/／].*', [600,0,680,160]), '取消库存操作');
      continue;
    }
    // 危机行动快速完成结果页：标题为描边艺术字，部分机器 OCR 读不出全串，
    // 故标题与右下角「确定」按钮任一命中即按结果页处理。
    // 分解弹窗等其他带「取消」的页面已被上方分支优先拦截，不会误入此处。
    const quick = await v.ocr('^快速完成结果$', [0,0,850,250]);
    const quickConfirm = await v.ocr('^确定$', [950,590,270,120]);
    if (quick || quickConfirm) {
      if (quickConfirm) await v.click(quickConfirm, '关闭快速完成结果');
      else await sleep(2000); // 确定按钮尚未出现(过渡中)，稍后重试，不盲点
      await v.wait(async()=>!await v.ocr('^快速完成结果$',[0,0,850,250])&&!await v.ocr('^确定$',[950,590,270,120]),'快速完成结果已关闭');
      continue;
    }
    // 快速完成次数加满后误触发的道具兑换弹窗：特征为「每日限购」文字，
    // 点底部居中的「确定」关闭；若按钮置灰无效则由循环重试，超轮次后安全抛错。
    if (await v.ocr('.*每日限购.*', [430,260,560,140])) {
      const exchangeConfirm = await v.ocr('^确定$', [560,540,340,130]);
      if (exchangeConfirm) await v.click(exchangeConfirm, '关闭兑换弹窗');
      await sleep(1200);
      continue;
    }
    if (await v.ocr('.*是否离开事务所.*')) {
      await v.step(() => v.template('事务所_离开确认对号.png', [350,200,650,350]), () => v.home(), '确认离开事务所');
      return;
    }
    const result = await v.ocr('.*请点击任意空白处关闭界面.*');
    if (result) {
      await v.click(result, '关闭解读结果');
      await v.wait(async () => !await v.ocr('.*请点击任意空白处关闭界面.*'), '解读结果已关闭');
      continue;
    }
    const friend = await v.ocr('^好友互助$', [0,40,430,150]);
    if (friend) {
      await require('./friend-window').closeFriend(v);
      continue;
    }
    const exit = await v.template('事务所_退出图标.png', [0,0,250,130]);
    if (exit) {
      await v.click(exit, '退出事务所');
      await v.wait(async () => await v.ocr('.*是否离开事务所.*') || await v.home(), '事务所退出结果');
      continue;
    }
    const home = await v.template(HOME_TEMPLATES, [0,0,500,150]);
    if (home) {
      await v.click(home, '返回主页');
      await v.wait(() => v.home(), '主页');
      return;
    }
    const back = await v.template('商店_左上返回箭头.png', [0,0,250,130]);
    if (back) {
      await v.click(back, '返回上一页');
      await v.wait(async () => await v.template('事务所_退出图标.png', [0,0,250,130]) || await v.home(), '上一页');
      continue;
    }
    throw new Error('未知页面，已停止恢复，避免误点');
  }
  throw new Error('无法安全回到主界面');
}
module.exports = { recover };
