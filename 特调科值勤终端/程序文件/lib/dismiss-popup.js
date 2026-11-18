// 升级弹窗（角色升级，中央 LV + EXP，会盖住结算/结果页）的通用检测与关闭。
// 适用所有战斗/领奖任务流：在「等待结果页」的循环顶部调用，若弹窗出现则关闭并让调用方重试。
//
// 设计要点：
//  - 只认升级弹窗独有特征（OCR「升级」或「LV<n>」），不误关其它弹窗；
//  - 关闭优先点弹窗外的「空白处（变暗遮罩）」让弹窗退出，不触发任何确认动作；
//    若空白关不掉，再兜底点「确定/确认/关闭」按钮，确保任务能继续；
//  - 每次检测到弹窗都存一张「升级弹窗_<name>_<时间戳>.png」到程序文件/，便于事后核对；
//  - 不抛错：检测不到返回 false，调用方正常继续；检测到并关闭返回 true。
//
// 参数：
//   v    - Flow / Vision 实例，需提供 .ocr(text,roi) / .click(reco,label) / .capture(filePath)
//   opts - { name='task', log=console.log }
// 返回：boolean（true=检测到并关闭，false=未检测到）
const path = require('path');

async function dismissLevelUp(v, opts = {}) {
  const name = opts.name || 'task';
  const log = opts.log || console.log;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let marker;
  try {
    // 升级弹窗主体约占屏幕中部（y:80–620），在此 ROI 内识别「升级」或「LV+数字」。
    marker = await v.ocr('升级|^LV[\\s　]*[0-9]{1,3}', [200, 80, 880, 540]);
  } catch (_) { return false; }
  if (!marker) return false;
  const text = marker && marker.detail && marker.detail.best && marker.detail.best.text;
  log('检测到升级弹窗，点击空白处退出', { name, text });
  // 留档：每次检测到都存一张截图（运行期产物，打包时已排除，不进发布包）。
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await v.capture(path.join(__dirname, '..', `升级弹窗_${name}_${ts}.png`));
  } catch (_) {}
  // 关闭方式：点弹窗外的「空白处（变暗遮罩）」让弹窗消失，而非点「确定」按钮——
  // 这样只退出弹窗、不触发任何确认动作，最安全。
  // 升级弹窗主体约占 x:200-1080 / y:80-620（见上方检测 ROI），其外的遮罩区域点一下即可退出。
  // LEVELUP_BLANK_CLICK 为空白处坐标，可按实机布局微调（建议选弹窗左右两侧的暗色遮罩）。
  const LEVELUP_BLANK_CLICK = [40, 400];   // 弹窗左侧空白遮罩（x<200，落在变暗遮罩上）
  try {
    await v.click({ detail: { best: { box: [LEVELUP_BLANK_CLICK[0], LEVELUP_BLANK_CLICK[1], 10, 10] } } }, '升级弹窗_点空白退出');
  } catch (_) {}
  await sleep(700);
  // 复核：点空白处是否真的把弹窗关掉了（再 OCR 一次同区域）。
  let still;
  try { still = await v.ocr('升级|^LV[\\s　]*[0-9]{1,3}', [200, 80, 880, 540]); } catch (_) { still = null; }
  if (!still) { await sleep(300); return true; }
  // 极少数布局点空白不会关弹窗：兜底点「确定/确认/关闭」按钮，确保任务能继续。
  let btn;
  try { btn = await v.ocr('^(确定|确认|关闭)$', [0, 0, 1280, 720]); } catch (_) {}
  if (btn) {
    try { await v.click(btn, '升级弹窗关闭兜底'); } catch (_) {}
    await sleep(900);
    return true;
  }
  try { await v.click({ detail: { best: { box: [490, 560, 300, 110] } } }, '升级弹窗关闭兜底2'); } catch (_) {}
  await sleep(900);
  return true;
}

// ---------------------------------------------------------------------------
// 行动力相关的「快速完成」弹窗。
//
// 正常任务流只会用到「次数 + 黄条 + 取消/出发」的标准弹窗；但体力不足时游戏会弹出
// 它的变体：顶部多一条「行动力道具（行动力不够时自动使用）」和道具格，
// 此时右下「出发」会**消耗玩家的行动力道具**，属于不可逆操作。
//
// 所以：只要看到「行动力道具」这一行，就一律点「取消」退出，绝不点「出发」。
// 该弹窗也可能在任何体力相关流程的收尾、返回主页途中冒出来，故在 homeReturn 里也做一次清理。
//
// 2026-11-18 实测（1280×720 基准）：
//   「行动力道具（行动力不够时自动使用）」0.976 box[458,160,322,30]
//   「取消」0.999 box[597,551,55,26]（中心≈624,564）
//   「出发」0.999 box[861,549,57,30]（绝对不能点）
const POWER_LABEL = '^行动力道具|行动力不[够足]时自动使用';
const POWER_LABEL_ROI = [400, 130, 700, 70];
const QUICK_TITLE_ROI = [150, 80, 320, 70];
const CANCEL_ROI = [500, 520, 320, 90];
const CANCEL_POINT = [624, 564];

async function hasPowerDialog(v) {
  try { return Boolean(await v.ocr(POWER_LABEL, POWER_LABEL_ROI)); } catch (_) { return false; }
}

async function closeByCancel(v, log, cancel) {
  let target = cancel || null;
  if (!target) {
    try { target = await v.ocr('^取消$', CANCEL_ROI); } catch (_) {}
  }
  try {
    if (target) await v.click(target, '体力弹窗_取消');
    else await v.click({ detail: { best: { box: [CANCEL_POINT[0], CANCEL_POINT[1], 10, 10] } } }, '体力弹窗_取消兜底');
  } catch (_) {}
  // 弹窗退场动画很短；调用方（homeReturn 等）紧接着还会复核一次页面，
  // 这里只需给出点击后最短的缓冲，别把返回主页的收尾拖长。
  await new Promise(r => setTimeout(r, 450));
  return true;
}

async function cancelPowerDialog(v, opts = {}) {
  const log = opts.log || console.log;
  log('检测到「行动力道具」弹窗（体力不足变体），点击取消退出');
  return closeByCancel(v, log);
}

// 返回主页等「非正规路径」上的通用清理：遇到「快速完成」弹窗（含体力不足变体，
// 变体多一条「行动力道具」提示）只点「取消」退出，绝不点「出发」。
// 注意：正常扫荡弹窗同样带「行动力道具」那一行，所以这里只认「标题 + 取消」，
// 并仅在 homeReturn 这类非扫荡路径上调用，避免把正常扫荡取消掉。
async function dismissStaminaPopup(v, opts = {}) {
  const log = opts.log || console.log;
  let title = null;
  try { title = await v.ocr('^快速完成$', QUICK_TITLE_ROI); } catch (_) { return false; }
  if (!title) return false;
  let cancel = null;
  try { cancel = await v.ocr('^取消$', CANCEL_ROI); } catch (_) {}
  if (!cancel) return false;
  log('检测到「快速完成」弹窗，点击取消退出（不点出发，避免消耗行动力道具）');
  return closeByCancel(v, log, cancel);
}

module.exports = { dismissLevelUp, hasPowerDialog, cancelPowerDialog, dismissStaminaPopup };
