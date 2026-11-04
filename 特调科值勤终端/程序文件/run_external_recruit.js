const {enterExternal,occupiedSlots,externalPage}=require('./lib/recruit-sidebar');
const {Flow,integer,sleep} = require('./lib/flow');
const {finishRecruitResult}=require('./lib/recruit-result');
const {dismissLevelUp}=require('./lib/dismiss-popup');
// 右上角 HUD 的「外招券」数量格（游戏后台捕获恒归一化到 1280×720）。
// 2026-11-05 实测此 ROI 偏右：券数字实际在 x≈1098~1112，[1140,20,65,40] 覆盖到的是
// 右边另一个货币图标，所以经常读不出（返回 null）。故意不改坐标——改错可能把别的数字
// 误读成 0 而漏跑招募；这里只保留「尽力记录初始值 / 读到 0 时提前收工」的加速路径，
// **券数主判据一律以数量弹窗的 MAX 次数与不可用提示为准，不依赖 HUD**。
// 数字被 OCR 成纯数字才采信，故图标会被 ^[0-9]+$ 过滤掉。
const TICKET_ROI=[1140,20,65,40];
// 可靠读取外招券数量：丢弃低置信度读数，需两次一致高分才采信；读不出返回 null（按未知处理，绝不贸然跳过）。
// attempts 默认 2：该 ROI 在本机实测恒读不出（见上方注释），原来试 6 次会让进页后白等约 4.4 秒。
// 试两次仍读不出就立刻按「未知」继续，判定改走数量弹窗 MAX 次数 / 点确定后的槽位变化。
async function readTicketCount(v,attempts=2){
 const seen=new Map();
 for(let attempt=0;attempt<attempts;attempt++){
  const reco=await v.ocr('^[0-9]+$',TICKET_ROI);
  const best=reco&&reco.detail&&reco.detail.best;
  if(best&&best.score>=0.8){
   const value=Number(best.text);
   if(Number.isInteger(value)){
    const hits=(seen.get(value)||0)+1;seen.set(value,hits);
    if(hits>=2){return value;}
   }
  }
  if(attempt<attempts-1)await sleep(400);
 }
 return null;
}
async function run(session) {
 const v=new Flow(session);
 // 状态判据：招募循环内用它区分「启动招募 / 招募成功 / 任务已满」三种分支。
 const marker=()=>v.ocr('^(启动招募|招募成功|任务已满)$',[800,400,480,320]);
 // 进入外部招募改用「页面判据」（外部招募页独有：大标题/EXTERNAL RECRUIT/状态按钮 启动招募·任务已满·招募成功）。
 await enterExternal(v,()=>externalPage(v));
 // 一开始先记录外招券数量。实测右上角券数 HUD 在部分界面/皮肤下读不出（ROI 里只识别到券图标），
 // 读不出返回 null 时按「未知」处理、绝不贸然跳过；后续用数量弹窗里 MAX 选中的次数判定券是否够填满槽。
 const tickets=await readTicketCount(v);
 console.log(tickets===null
  ? '外招券初始数量读取失败：按未知处理，后续以弹窗 MAX 次数判定'
  : `外招券初始数量 ${tickets}`);
 // 外招券为 0 时无可招募券：直接退回主界面并正常结束，不再进入必然失败的招募循环。
 if(tickets===0){
  console.log('外招券为 0，跳过外部招募');
  await v.homeReturn();
  return;
 }
 for(let round=0;round<12;round++) {
  // 升级弹窗会盖住招募状态页，先关掉再等状态，避免 v.wait 超时。
  if(await dismissLevelUp(v,{name:'外部招募'}))continue;
  const state=await v.wait(marker,'招募状态',{timeout:15000});
  const text=state.detail.best.text;
  if(text==='任务已满'){await v.homeReturn();return;}
  if(text==='招募成功') {
   await v.step(marker,async()=>await v.reward() || !await marker(),'领取招募结果',{irreversible:true});
   await finishRecruitResult(v,marker,{animationAllowed:true,timeout:15000});
  } else {
   const occupied=await occupiedSlots(v);
   if(!Number.isInteger(occupied)||occupied<0||occupied>=4)throw new Error('无法确认空闲招募槽数量');
   // 每轮刷新剩余外招券：上一轮招募会消耗券，本轮的支付上限随之下降。
   // 进页时已确认 HUD 券数读不出（null）就不再重复 6 次 OCR，省约 2~3 秒空转；
   // 读得出时照常重读，保持原有「可支付」校验。
   const remaining=tickets===null?null:await readTicketCount(v);
   const slots=4-occupied;
   if(remaining===0){console.log('外招券已用尽，结束外部招募');await v.homeReturn();return;}
   const modal=()=>v.ocr('单次耗时.*分钟',[400,180,500,160]);
   await v.textStep('^启动招募$',modal,'打开招募数量',[800,400,480,320]);
   const count=async()=>integer(await v.ocr('^[0-9]+$',[600,345,80,55]));
   // 点 MAX 后不校验“应该等于某个具体数字”，只校验“这个选择能不能成立”：
   // 至少 1 次，且不超过手上剩余的外招券（付得起）。
   // 理由：MAX 的语义是“游戏认为能选到的最大次数”，弹窗自己也会显示「总共需要消耗 N」。
   // 若在外部把上限硬编码成 min(空槽, 券数) 并要求精确相等，等于要求我们复刻游戏内部规则——
   // 任何偏差（单次上限、其它隐藏限制）都会让校验反复失败并重试，表现为连点 MAX 三次后报错。
   // 改为校验“可支付”这一真正关心的性质后，游戏给多少就用多少，不会因期望值过具体而空转。
   // 券数读不出时按“未知”处理：退而要求选到 1..空槽 之间的稳定值，有多少券用多少券。
   const affordable=a=>Number.isInteger(a)&&a>=1&&(remaining===null?a<=slots:a<=remaining);
   // 兼容兜底（本机未触发）：某些客户端/版本在券尽时可能把 MAX 次数显示成 0，
   // 或在数量弹窗内直接写「券不足 / 数量不足 / 暂不可用」。用弹窗文案判定，不依赖 HUD。
   // 正则刻意不含「外招券」等通用词，避免把「总共需要消耗 N 外招券」误判成不可用。
   // 注意 2026-11-05 01:36 真机实测：券 0 时 MAX 仍显示 1、弹窗内并无否定文案，
   // 真实信号是点「确定」后右上角弹出的「道具不足」toast（见下方 insufficient 探测）。
   const noTicket=async()=>!!await v.ocr('券.{0,6}不足|不足.{0,6}券|无法招募|数量不足|暂不可用',[400,180,500,260]).catch(()=>null);
   // MAX is idempotent; verify a stable selected count and record it: a = min(空槽数, 手上券数)。
   let selected=null, exhausted=false;
   await v.step(()=>v.template('招募数量_MAX.png',[690,260,260,210],0.76),async()=>{
    const a=await count();
    if(a===0 || (a===null && await noTicket())){
     exhausted=true;selected=0;
     return true;
    }
    if(!(affordable(a) && a===await count()))return false;
    selected=a;
    return true;
   },'选择招募 MAX');
   // 券为 0：不可点「确定」（否则必然白等结果确认超时），关掉数量弹窗后直接正常收工。
   if(exhausted){
    console.log('外招券为 0（MAX 可选次数为 0 或弹窗提示不可用），结束外部招募');
    const cancel0=await v.ocr('^取消$',[380,430,420,180]).catch(()=>null);
    if(cancel0)await v.click(cancel0,'关闭招募数量弹窗').catch(()=>{});
    await v.homeReturn();
    return;
   }
   // 用户实测规则（2026-11-05）：MAX 选中次数 a = min(空槽数 slots, 手上券数 T)。
   //  · a >= slots（券够填满槽，含 T=4 / T>4）：确认后出现「任务已满」，券减少 slots；
   //  · a <  slots（0<T<slots）：x=a 张券全部花完变 0，右下角仍是「启动招募」，
   //    **不会出现「任务已满」**。旧版在这种情形硬等「任务已满」14.5 秒，随后找「取消」
   //    （弹窗已被确定关闭，按钮不存在）又白等 15 秒，合计约 31 秒空等才回主页。
   // 券数 HUD 读不出时，a 本身就是本次消耗的全部券数 x，据此判定即可，不依赖 HUD。
   const expectFull=Number.isInteger(selected)&&selected>=slots;
   console.log(expectFull
    ? `MAX 选中 ${selected} 次（空槽 ${slots}），券足够填满槽位，确认后等待「任务已满」`
    : `MAX 选中 ${selected} 次（空槽 ${slots}），未填满槽位，不等待「任务已满」，确认后直接结束`);
   let started=true;
   try{
    await v.textStep('^确定$',
      expectFull
        ? ()=>v.ocr('^任务已满$',[800,400,480,320])
        : async()=>!(await modal()),
      '确认招募',[560,400,360,190],{irreversible:true});
   }catch(error){
    started=false;
    console.log('确认招募未生效：',error.message);
   }
   // —— 点确定后判定「招募是否真的启动了」——
   // 2026-11-05 真机实测（券 0）：数量弹窗 MAX 仍显示 1、弹窗里没有任何否定文案；
   // 点「确定」后右上角闪一条「道具不足」toast（停留很短，OCR/截图可能错过），
   // 随后数量弹窗关闭、**4 个招募槽仍然全空**，招募根本没启动、一张券也没花。
   // 所以主判据用「点确定后槽位占用数有没有比点击前增加」：
   //  · 增加 → 招募真的启动了（正常消耗券）；
   //  · 始终没增加且仍是 0/4 全空 → 券为 0，什么都没启动。
   // 「道具不足」toast 只作辅助锚点（一闪而过，不能单独依赖），故只在它命中时缩短轮询。
   const insufficient=await v.ocr('道具不足',[900,110,380,120]).catch(()=>null);
   let after=null;
   for(let i=0;i<6;i++){
    const now=await occupiedSlots(v).catch(()=>null);
    if(Number.isInteger(now)){
     after=now;
     if(now>occupied)break;
    }
    if(insufficient&&i>=1)break;
    await sleep(600);
   }
   const startedNow=Number.isInteger(after)&&after>occupied;
   const stillEmpty=Number.isInteger(after)&&after===0;
   if(!startedNow&&(stillEmpty||insufficient)){
    console.log(`外招券为 0（${stillEmpty?'点确定后招募槽位仍为 0/4 全空':'游戏提示「道具不足」'}，未消耗任何券、招募未启动），结束外部招募`);
    await v.homeReturn();
    return;
   }
   // 弹窗通常已被「确定」关闭；只做一次 OCR 探测，有「取消」才点。
   // 绝不再用 textStep —— 它内部找按钮的 wait 用默认 15 秒，按钮不存在时会白等一轮。
   const cancel=await v.ocr('^取消$',[380,430,420,180]).catch(()=>null);
   if(cancel)await v.click(cancel,'关闭招募数量弹窗').catch(()=>{});
   // 极少数情况有即时奖励，顺手领掉再收工。
   if(await v.reward())await v.rewardClick().catch(()=>{});
   await v.homeReturn();
   console.log(startedNow
    ? (expectFull
       ? `已启动 ${selected} 次招募，槽位已满（${after}/4），结束外部招募`
       : `${selected} 张外招券已全部使用（剩余 0），已启动 ${after}/4 个槽，结束外部招募`)
    : (started
       ? `招募已提交（槽位 ${after===null?'读取失败':after+'/4'}），结束外部招募`
       : '确认未生效，已返回主界面，结束外部招募'));
   return;
  }
 }
 throw new Error('招募循环达到保护上限');
}
module.exports={run};
