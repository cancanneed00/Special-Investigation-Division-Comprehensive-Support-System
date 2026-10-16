const { Vision } = require('./lib/vision');
let vision;
const fs = require("fs");
const path = require("path");
const maa = require("./node_modules/@maaxyz/maa-node");

const ROOT = __dirname;
const LOG_FILE = path.join(ROOT, "运行_危机行动.log");
const IMAGE_FILE = path.join(ROOT, "运行结果_危机行动.png");
const STATE_FILE = path.join(ROOT, "危机行动运行状态.json");
const RESOURCE_DIR = path.join(ROOT, "resource", "base");

let controller = null;
let resource = null;
let tasker = null;

function log(...values) {
  const line = `[${new Date().toISOString()}] ${values.map(value =>
    typeof value === "string" ? value : JSON.stringify(value)
  ).join(" ")}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));


function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function capture(save = null) { return vision.capture(save); }

async function recognize(type, param, options = {}) {
  const attempts = options.attempts ?? 1;
  const delay = options.delay ?? 500;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const image = await capture();
    const job = await tasker.post_recognition(type, param, image).wait();
    const detail = await job.get();
    const node = detail?.nodes?.[0] ? tasker.node_detail(detail.nodes[0]) : null;
    const reco = node?.reco || null;
    if (reco?.hit && reco.detail?.best) {
      log("识别成功", { type, best: reco.detail.best, attempt });
      return reco;
    }
    if (attempt < attempts) await sleep(delay);
  }
  return null;
}

async function ocr(expected, roi, options = {}) {
  return recognize("OCR", {
    expected,
    roi,
    order_by: options.orderBy || "Expected",
  }, options);
}

async function template(templateName, roi, options = {}) {
  return recognize("TemplateMatch", {
    template: templateName,
    roi,
    threshold: options.threshold ?? 0.76,
  }, options);
}

async function clickBox(box, label) {
  const [x, y, width, height] = box;
  const point = [Math.round(x + width / 2), Math.round(y + height / 2)];
  vision.s.check();
  const job = await controller.post_click(point[0], point[1]).wait();
  if (!job.succeeded) throw new Error(`点击失败：${label}`);
  log("点击", { label, point, box });
}

async function clickOcr(expected, roi, label, options = {}) {
  const reco = await ocr(expected, roi, {
    attempts: options.attempts ?? 10,
    delay: options.delay ?? 500,
    orderBy: options.orderBy,
  });
  if (!reco) throw new Error(`未识别到：${label}`);
  await clickBox(reco.detail.best.box, label);
  await sleep(options.postDelay ?? 600);
  return reco;
}

async function clickTemplate(templateName, roi, label, options = {}) {
  const reco = await template(templateName, roi, {
    attempts: options.attempts ?? 10,
    delay: options.delay ?? 500,
    threshold: options.threshold,
  });
  if (!reco) throw new Error(`未识别到：${label}`);
  await clickBox(reco.detail.best.box, label);
  await sleep(options.postDelay ?? 500);
  return reco;
}

async function waitOcr(expected, roi, label, attempts = 16) {
  const reco = await ocr(expected, roi, { attempts, delay: 500 });
  if (!reco) throw new Error(`等待界面超时：${label}`);
  return reco;
}

function parseFirstInteger(text, label) {
  const match = String(text || "").match(/\d+/);
  if (!match) throw new Error(`无法解析${label}：${text}`);
  return Number(match[0]);
}

async function readOrderCount() {
  // 调令数字只有十几像素，OCR 低置信度时会误读（实测把 3 读成 7，score 仅 0.649），
  // 目标次数从源头算错会导致后面全部跑偏。故：低于 0.85 的读数直接丢弃，
  // 且必须两次高分读数一致才采信；拿不到一致结果就安全停止，不带着错值继续跑。
  const seen = new Map();
  for (let i = 0; i < 12; i++) {
    const reco = await ocr("^[0-9]+$", [220, 405, 270, 100], {
      attempts: 1,
      delay: 500,
      orderBy: "Area",
    });
    const best = reco && reco.detail && reco.detail.best;
    if (best && best.score >= 0.85) {
      const value = parseFirstInteger(best.text, "危机行动调令数量");
      const hits = (seen.get(value) || 0) + 1;
      seen.set(value, hits);
      if (hits >= 2) {
        log("危机行动调令数量", value);
        return { count: value, box: best.box };
      }
    } else if (best) {
      log("调令读数置信度低，丢弃", { text: best.text, score: best.score });
    }
    await sleep(400);
  }
  throw new Error("调令数量多次读取无法取得一致结果，已停止，避免误点。");
}

async function findAndSelectS303() {
  for (let swipe = 0; swipe <= 8; swipe++) {
    const reco = await ocr("^S303.*$", [0, 120, 430, 590], {
      attempts: 2,
      delay: 350,
      orderBy: "Vertical",
    });
    if (reco) {
      await clickBox(reco.detail.best.box, "S303 乐园梦魇III");
      await waitOcr(".*乐园梦魇.*", [850,60,430,180], "S303 详情确认", 12);
      log("已选择 S303 乐园梦魇III", { swipes: swipe });
      return;
    }
    if (swipe === 8) break;
    const job = await controller.post_swipe(200, 620, 200, 190, 600).wait();
    if (!job.succeeded) throw new Error("关卡列表滑动失败。");
    log("滑动关卡列表", { index: swipe + 1 });
    await sleep(700);
  }
  throw new Error("滑动后仍未找到 S303 乐园梦魇III。");
}

async function readQuickCount(attempts = 12) {
  const reco = await ocr(".*[0-9]+次.*", [500, 315, 470, 150], {
    attempts,
    delay: 400,
    orderBy: "Expected",
  });
  if (!reco) throw new Error("没有读到当前快速完成次数。");
  return parseFirstInteger(reco.detail.best.text, "快速完成次数");
}

function saveState(targetCount) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify({ targetCount }, null, 2)}\n`, "utf8");
}

function recoverTargetCount(previousLog) {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (Number.isInteger(saved.targetCount) && saved.targetCount > 0) {
        return saved.targetCount;
      }
    } catch (_) {}
  }
  const matches = [...String(previousLog || "").matchAll(/危机行动调令数量\s+(\d+)/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

function clearState() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

async function setQuickCount(target) {
  const {adjustCount}=require('./lib/adjust-count');
  const reached=await adjustCount(()=>readQuickCount(4),async direction=>{
    await clickTemplate(direction>0?'流程_危机加号.png':'流程_危机减号.png',
      direction>0?[900,370,190,170]:[430,370,160,170],direction>0?'次数加一':'次数减一',
      {attempts:3,postDelay:500,threshold:0.74});
  },target);
  // 加到上限仍不足目标时按上限执行（如快速完成每日上限 < 调令数），不继续点加号
  if(reached<target)log(`快速完成次数上限 ${reached} 不足目标 ${target}，按上限执行`);
  if(await readQuickCount(4)!==reached)throw new Error('出发前次数复核不一致');
  return reached;
}

async function returnFromSystemToHome() {
  await require('./lib/system-return').returnFromSystem(vision);
}

async function returnHome() {
  await clickTemplate(
    "商店_左上返回箭头.png",
    [0, 0, 250, 120],
    "第一次返回箭头",
    { attempts: 16, postDelay: 700 },
  );
  await returnFromSystemToHome();
}

async function closeQuickResult() {
  for (let attempt=0; attempt<30; attempt++) {
    if (await vision.reward()) {
      await vision.dismissReward(() => vision.ocr('^快速完成$', [760,590,360,130]));
      return;
    }
    const confirm = await vision.ocr('^确定$', [950,590,270,120]);
    if (confirm) {
      await vision.click(confirm, '快速完成结果确定');
      await vision.wait(async () => await vision.reward() || await vision.ocr('^快速完成$', [760,590,360,130]), '快速完成结果关闭');
      continue;
    }
    if(await vision.ocr('^快速完成$', [760,590,360,130]))return;
    await sleep(450);
  }
  throw new Error('快速完成结果未确认关闭');
}

async function finishQuickAction(targetCount) {
  const usedCount=await setQuickCount(targetCount);
  await clickOcr("^出发$", [680, 480, 380, 150], "出发", {
    attempts: 10,
    postDelay: 800,
  });
  // 结果页标题是描边艺术字叠在角色立绘上，部分机器 OCR 读不出全串，
  // 故先等标题，读不到再等右下角「确定」按钮（实心色块+黑字，识别率高）兜底
  let resultPage = await ocr("^快速完成结果$", [0, 0, 850, 250], { attempts: 12, delay: 500 });
  if (!resultPage) resultPage = await ocr("^确定$", [950, 590, 270, 120], { attempts: 10, delay: 500 });
  if (!resultPage) throw new Error("等待界面超时：快速完成结果");
  await closeQuickResult();
  await returnHome();
  clearState();
  await capture(IMAGE_FILE);
  log("任务完成", { orderCount: targetCount, usedCount, stage: "S303 乐园梦魇III" });
}

async function run(session) {
  const previousLog = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, "utf8") : "";
  fs.appendFileSync(LOG_FILE, `\n===== ${new Date().toISOString()} 新一轮危机行动 =====\n`, "utf8");
  ({controller, resource, tasker} = session);
  vision = new Vision(session);

  await capture(IMAGE_FILE);
  const interruptedModal = await ocr(".*[0-9]+次.*", [500, 315, 470, 150], {
    attempts: 2,
    delay: 300,
  });
  if (interruptedModal) {
    const recoveredTarget = recoverTargetCount(previousLog);
    if (!recoveredTarget) {
      throw new Error("检测到快速完成弹窗，但没有找到此前记录的调令数量。");
    }
    log("从快速完成弹窗恢复任务", { targetCount: recoveredTarget });
    saveState(recoveredTarget);
    await finishQuickAction(recoveredTarget);
    return;
  }

  const interruptedSystem = await ocr("^设置$", [0, 500, 300, 220], {
    attempts: 2,
    delay: 300,
  });
  if (interruptedSystem && fs.existsSync(STATE_FILE)) {
    log("检测到扫荡完成后停留在系统页，继续执行第二次返回");
    await returnFromSystemToHome();
    clearState();
    await capture(IMAGE_FILE);
    log("任务完成", { recoveredAt: "系统页返回" });
    return;
  }

  if (!interruptedSystem) {
    const entry=await vision.wait(()=>vision.homeButton('system'),'主页系统按钮',{stable:1});
    await vision.click(entry,'主页系统按钮');
    await sleep(700);
  }
  await waitOcr("^设置$", [0, 500, 300, 220], "系统页", 20);

  const order = await readOrderCount();
  if (order.count <= 0) {
    log("调令数量为 0，直接返回主界面。");
    await clickTemplate("商店_左上返回箭头.png", [0, 0, 250, 120], "返回主界面", {
      attempts: 10,
    });
    await vision.wait(()=>vision.home(),'主界面');
    await capture(IMAGE_FILE);
    return;
  }

  saveState(order.count);

  await clickBox(order.box, "危机行动调令入口");
  await sleep(800);
  await waitOcr("^快速完成$", [760, 590, 360, 130], "危机行动关卡页", 20);

  await findAndSelectS303();
  await clickOcr("^快速完成$", [760, 590, 360, 130], "快速完成", {
    attempts: 12,
    postDelay: 700,
  });
  await readQuickCount(16);
  await finishQuickAction(order.count);
}

module.exports = { run };
