'use strict';
const {Flow}=require('./flow');
const {SkillTracker,fraction,clean}=require('./sea-engine');
const FULL=[0,0,1280,720];
const point=(x,y)=>({detail:{best:{box:[x-2,y-2,4,4]}}});
// 灵感识别轮询调优：短间隔（更快捕获卡片停稳瞬间）+ 高连续帧数（短间隔下防抖，避免瞬时抖动误判「已停稳」）。
const INS_POLL=70;     // 灵感识别轮询间隔 ms（全局默认 130）
const INS_STABLE=4;    // 灵感识别连续稳定帧数（原 3）：间隔缩短后总耗时持平或更低，同时多一次确认更稳
class SeaPort{
 constructor(session,channel){this.s=session;this.v=new Flow(session);this.channel=channel;this.state={};this._recovering=false;}
 check(){this.s.check();this.channel.check();}
 async sleep(ms=130){for(let left=ms;left>0;left-=100){this.check();await new Promise(r=>setTimeout(r,Math.min(left,100)));}}
 // 用户可见的「行动记录」仅由显式 status() 推送（去重，避免同一状态反复写）。
 // wait() 的内部轮询标签默认 quiet，只用于报错定位，不刷屏给用户看。
 // status() 同时写两处：海域运行状态.json（顶部状态）+ 运行_认知海域.log（「行动记录」面板）。
 status(text,{quiet=false}={}){this.lastStatus=text;if(quiet)return;if(text===this._pushed)return;this._pushed=text;this.channel.status('running',text,this.state);if(typeof this.channel.log==='function')this.channel.log(text);}
 progress(engine,total){this.state={round:engine.round,battle:engine.battle,stage:engine.stage};this.status(`第 ${engine.round} 轮 · 战斗 ${engine.battle}/${total}`);}
 async rows(roi=FULL){this.check();const r=await this.v.ocr('.*',roi);const all=(r?.detail?.all||[]).filter(r=>r.score>=0.65);
    const popup=all.find(x=>/只打开一个异象回声/.test(x.text));
    if(popup)throw new Error('游戏弹出“请只打开一个异象回声PC客户端”：判定存在多个客户端（多为上次未正常退出的残留进程）。请结束多余进程后重试；终端已停止，未执行任何操作。');
    return all;}
 hit(rows,pattern,roi=FULL){return rows.find(r=>pattern.test(clean(r.text))&&r.box[0]>=roi[0]&&r.box[1]>=roi[1]&&r.box[0]<roi[0]+roi[2]&&r.box[1]<roi[1]+roi[3]);}
 // wait() 的内部轮询标签不推送用户可见记录（quiet），仅用于报错时定位；
 // 真正要展示给用户的关键阶段由下方各方法显式 status() 给出。
 async wait(label,probe,timeout=90000,stable=2,quiet=true,interval=130){this.status(label,{quiet:true});const end=Date.now()+timeout;let n=0,last;while(Date.now()<end){this.check();await this.guardAbandon();try{last=await this.v.frame(async()=>await this.v.loading()?null:probe());}catch(e){if(e.code!=='PAGE_TRANSITION')throw e;last=null;}n=last?n+1:Math.max(0,n-1);if(n>=stable)return last;await this.sleep(interval);}throw new Error('等待超时：'+label);}
 async tap(row,label){await this.v.click(row.detail?row:{detail:{best:row}},label);await this.sleep(100);}
 async at(x,y,label){await this.tap(point(x,y),label);}
 async text(pattern,roi=FULL){return this.hit(await this.rows(roi),pattern,roi);}
 async clickText(pattern,label,roi=FULL){const r=await this.wait(label,()=>this.text(pattern,roi));await this.tap(r,label);}
 // 立绘背景会压低「战斗胜利/探索完成」等结果页大字的 OCR 置信度，导致结算/完结界面识别失败。
 // rowsLoose/textLoose 用更低的分数门槛做兜底识别，只在明确的结果页判定处使用，不改变全局 0.65 阈值。
 async rowsLoose(roi=FULL,minScore=0.45){this.check();const r=await this.v.ocr('.*',roi);const all=(r?.detail?.all||[]).filter(r=>r.score>=minScore);
    const popup=all.find(x=>/只打开一个异象回声/.test(x.text));
    if(popup)throw new Error('游戏弹出“请只打开一个异象回声PC客户端”：判定存在多个客户端（多为上次未正常退出的残留进程）。请结束多余进程后重试；终端已停止，未执行任何操作。');
    return all;}
 async textLoose(pattern,roi=FULL,minScore=0.45){return this.hit(await this.rowsLoose(roi,minScore),pattern,roi);}
 // 点击后确认「预期状态」确实出现，才继续下一步；确认失败（多为点击瞬间移动鼠标导致未点中）
 // 则重新定位并补点，而不是误以为操作已成功、盲目进入下一环节或干等 90 秒超时。
 // 只重试导航/确认类按钮，不重放任何可能重复消费的操作。
 async clickAndConfirm(probe,expected,label,{confirmMs=5000,attempts=5}={}){
    for(let a=1;a<=attempts;a++){
     // 先判「下个阶段」是否已到（上一轮点击可能已生效、只是确认偏慢）——到了即完成，不重复点击。
     if(await this.isTrue(expected,1000))return;
     let target;
     try{ target=await this.wait(label,probe,15000,1); }
     catch(e){
      // 找不到目标：可能点击已生效、页面切换中（目标消失、下阶段未就绪）。短等再判下阶段后决定。
      if(await this.isTrue(expected,confirmMs))return;
      throw new Error('未找到可点击目标：'+label+'（'+e.message+'）');
     }
     await this.tap(target,label);
     // 第一次确认（已缩短）：等 expected 出现。
     try{ await this.wait(label+'生效确认',expected,confirmMs,1); return; }
     catch(e){
      if(!/等待超时|结果未确认/.test(e.message))throw e;
      // 第一次确认结束仍未到下阶段 → 立即进入下一轮重放（重定位+重点击），不再 24s 慢等。
     }
    }
    throw new Error('点击未能生效：'+label);
 }
 // 静默预检：expected 命中返回 true，超时返回 false，其它异常（如反多开弹窗）原样抛出。
 async isTrue(probe,timeout=1500){try{await this.wait('状态预检',probe,timeout,1);return true;}catch(e){if(/等待超时|结果未确认/.test(e.message))return false;throw e;}}
 async ask(kind,message){return this.channel.ask(kind,message,this.state);}
 async home(){
  this.status('返回游戏主页');
  // 若下潜仍在进行（例如用户中途点击停止），先干净地终止下潜再回主页，
  // 避免把游戏卡在「下潜中」界面。终止逻辑幂等、可断点续做。
  try{ await this.terminateDive(); }catch(e){ console.log('终止下潜（清理）未完全成功：'+e.message); }
  await this.v.homeReturn();
 }
 // 用户点击游戏内「停止」后：主动检测「是否放弃本次探索」弹窗并确认放弃，
 // 随后抛 USER_STOP 交由收尾逻辑干净终止（不返回主页）。无弹窗时零副作用。
 async guardAbandon(){
  const dlg=await this.abandonDialog();
  if(!dlg)return;
  let cx=611,cy=336;                                  // 确认对号默认坐标（右侧金色按钮）
  if(dlg.box){const bx=dlg.box[0]+dlg.box[2]/2,by=dlg.box[1]+dlg.box[3]/2;cx=Math.round(bx+70);cy=Math.round(by+87);}
  await this.at(cx,cy,'确认放弃探索');
  await this._waitSoft('等待探索终止界面',()=>this.explorationTerminated(),6000);
  if(this._recovering){                               // 恢复流程（先终止并继续下潜）：仅代为确认放弃，不抛 USER_STOP，让外层继续开启新下潜
   this.status('残留下潜已清理，继续开启新下潜');
   return;
  }
  const e=new Error('用户已在游戏内点击「停止」，已确认放弃本次探索');e.code='USER_STOP';throw e;
 }
 // 用户停止：仅干净终止下潜并收敛到海域地图，不强制返回游戏主页（区别于 home()）。
 async stop(){
  this.status('终止下潜');
  try{ await this.terminateDive(); }catch(e){ console.log('终止下潜未完全成功：'+e.message); }
 }
 // 下潜总览界面右下角有「终止下潜」按钮时，说明下潜仍在进行。
 // 注意：该总览界面同时满足 map()（含 意识碎片 + 梦渊层），故必须以 终止下潜 存在性为判据。
 async divingScreen(){const rows=await this.rows();return !!this.hit(rows,/终止下潜/,[820,520,460,200]);}
 // 游戏在残留下潜时弹出的「上次下潜未结束」对话框（含「先终止并继续下潜」/「退出任务」）。
 // 该按钮语义即「终止旧下潜并开始新下潜」，故检测到后应推进而非中止。
 async residualPopup(){return !!this.hit(await this.rows(),/上次下潜未结束/,[100,120,1080,360]);}
 // 「注意：是否放弃本次探索」确认弹窗（点终止下潜后弹出）。
 // ROI 必须覆盖弹窗正文（约 y=240~258），早期 [360,250,...] 从 y=250 起，把正文上沿漏掉导致检测不到、对号点不到。
 async abandonDialog(){return await this.text(/放弃本次探索|是否放弃/,[330,185,640,310]);}
 // 「探索终止」结算界面（确认放弃后出现，需点左下空白返回海域地图）。
 // 标题「探索终止」常与 MISSION RESULTS 艺术字重叠、OCR 易失配；故增「完成节点」(完成节点 x/y)
 // 与英文 MISSION 作辅助锚点，任一命中即认定已进入该界面。
 async explorationTerminated(){
  const rows=await this.rowsLoose([0,80,640,580],0.42);
  return this.hit(rows,/探索终止/,[0,80,640,360])||this.hit(rows,/完成节点/,[0,80,640,580])||this.hit(rows,/MISSION/i,[0,80,640,360]);
 }
 // 软等待：超时返回 false 而非抛「等待超时」，避免中断清理流程。
 async _waitSoft(label,probe,timeout=8000){
  try{ return await this.wait(label,probe,timeout,1); }
  catch(e){ if(/等待超时/.test(e.message))return false; throw e; }
 }
 async terminateDive(){
  this.status('终止残留下潜');
  // 幂等状态机：无论当前卡在下潜的哪一子界面，都收敛到「海域地图」。
  // 不在下潜中（已是地图/主页等）则直接返回，无副作用。
  // stable=1 + 较短超时：放弃流程本身要快，不要长时间挂起。
  for(let guard=0;guard<6;guard++){
   if(await this.abandonDialog()){                                    // 注意弹窗 -> 点右侧金色对号确认放弃
    // 对号为右侧金色按钮（实测 ≈611,336）。若已通过 OCR 定位到弹窗正文，以其位置为锚点推算对号
    // 坐标（对号在正文右下方约 +70x/+87y），更稳；否则回退到固定坐标。切勿点左侧蓝色叉号（x≈471）。
    const dlg=await this.abandonDialog();
    let cx=611,cy=336;
    if(dlg&&dlg.box){const bx=dlg.box[0]+dlg.box[2]/2,by=dlg.box[1]+dlg.box[3]/2;cx=Math.round(bx+70);cy=Math.round(by+87);}
    await this.at(cx,cy,'确认放弃探索');
    await this.sleep(400);
    // 确认生效后应进入探索终止；若弹窗仍在（点击未生效），循环再点一次。
    if(await this.abandonDialog())continue;
    if(await this._waitSoft('探索终止',()=>this.explorationTerminated()))continue;
    continue;
   }
   if(await this.divingScreen()){                                     // 下潜总览 -> 点终止下潜
    await this.clickText(/终止下潜/,'终止下潜',[820,520,460,200]);
    if(await this._waitSoft('等待放弃确认弹窗',()=>this.abandonDialog()))continue;
    continue;
   }
   if(await this.explorationTerminated()){                           // 探索终止 -> 点左下空白返回地图
    await this.at(200,580,'关闭探索终止');
    await this.sleep(400);
    if(await this._waitSoft('返回海域地图',()=>this.map()))return true;
    return true;                                                     // 已点空白，视为完成
   }
   return false;                                                     // 不在可终止的下潜子界面
  }
  return false;
 }
 async enter(){
  this.status('进入认知海域');
  await this.wait('请从游戏大厅开始',()=>this.v.home());
  await this.tap(await this.v.homeButton('combat'),'作战');
  this.status('进入终局行动');
  await this.clickAndConfirm(()=>this.text(/终局行动/,[0,560,1280,160]),()=>this.text(/^认知海域$/),'进入终局行动');
  // The entry is below its recognized card title, not below a neighbouring mode.
  const title=await this.text(/^认知海域$/);const cx=title.box[0]+title.box[2]/2;
  const enterRoi=[Math.max(0,cx-120),title.box[1]+60,240,500];
  this.status('点击进入认知海域');
  await this.clickAndConfirm(async()=>this.hit(await this.rows(),/^进入$/,enterRoi),()=>this.map(),'进入认知海域');
 }
 async map(){const rows=await this.rows();return this.hit(rows,/意识碎(?:片)?/,[0,490,370,230])&&this.hit(rows,/(ABY13|梦渊层)/);}
 async shards(){await this.wait('读取意识碎片',()=>this.map());let previous=null;return this.wait('确认意识碎片数值',async()=>{const rows=await this.rows([0,570,360,150]);const values=rows.map(r=>fraction(r.text)).filter(v=>v!==null);if(values.length!==1)return null;const v=values[0],same=v===previous;previous=v;return same?{value:v}:null;}).then(r=>r.value);}
 async dive(full){
  await this.wait('选择梦渊层',()=>this.map());
  this.status(full?'满额下潜准备':'深潜下潜准备');
  // 残留下潜（上一次未干净结束）处理：游戏可能弹「上次下潜未结束」（含「先终止并继续下潜」，
  // 其语义即「终止旧下潜并开始新下潜」），也可能只停留于下潜总览（含「终止下潜」按钮），
  // 或用户已在游戏内点了「先终止并继续下潜」而「放弃本次探索」弹窗已出现。
  // 无论哪条路径，清理完旧下潜后都必须「继续」开始新下潜，不能半途停下。
  if(await this.divingScreen()||await this.residualPopup()||await this.abandonDialog()){
   this._recovering=true;                                // 恢复流程：期间出现的「放弃本次探索」视为终止步骤的一部分，不抛 USER_STOP
   try{
    if(await this.residualPopup()){
     // 游戏已弹「上次下潜未结束」：询问是否先终止旧下潜并继续（保留中止选项）。
     const action=await this.ask('abort','上一次下潜尚未干净结束（游戏弹出「上次下潜未结束」）。要先终止旧下潜、开始新的下潜吗？');
     if(action==='exit'){const stop=new Error('用户已停止海域任务');stop.code='USER_STOP';throw stop;}
     // 点「先终止并继续下潜」推进；若用户已在游戏内手动点过使弹窗消失，下方 terminateDive 会接着清理（catch 防误点）。
     await this.clickText(/先终止(并|再)继续下潜/,'先终止并继续下潜').catch(()=>{});
    }else if(await this.abandonDialog()){
     // 用户已在游戏内点了「先终止并继续下潜」/「停止」，放弃确认弹窗已出现：直接进入清理，不再二次询问。
    }else{
     // 仅下潜总览残留：询问用户是否终止后再开始。
     const action=await this.ask('abort','上一次下潜尚未干净结束（界面上仍有「终止下潜」按钮）。要先把它终止，再开始新的下潜吗？');
     if(action==='exit'){const stop=new Error('用户已停止海域任务');stop.code='USER_STOP';throw stop;}
    }
    // 把旧下潜干净终止并回到海域地图；恢复期间出现的「放弃本次探索」弹窗由 terminateDive/guardAbandon 代为确认。
    await this.terminateDive();
    await this.wait('返回海域地图',()=>this.map(),120000);
   }finally{this._recovering=false;}
  }
  await this.clickAndConfirm(()=>this.text(/ABY13/,[0,250,900,300]),()=>this.text(/开始下潜/,[900,550,380,170]),'进入 ABY13 梦渊层');
  this.status('进入 ABY13 梦渊层');
  const diveOption=async()=>{const rows=await this.rows();return this.hit(rows,/无法获得意识碎片/,[240,150,350,400])&&(full?this.hit(rows,/暂不可用|深潜指引/,[650,150,400,400]):this.hit(rows,/使用深潜指引/,[650,150,400,400]));};
  this.status(full?'点击开始满额下潜':'点击开始深潜');
  await this.clickAndConfirm(()=>this.text(/开始下潜/,[900,550,380,170]),diveOption,'开始下潜');
  this.status('编队确认');
  if(full)await this.clickAndConfirm(()=>point(420,335),()=>this.formationPage(),'满额：左侧自由探索');
  else await this.clickAndConfirm(()=>this.text(/使用深潜指引/,[650,150,400,400]),()=>this.formationPage(),'使用深潜指引');
 }
 async formationPage(){const rows=await this.rows();return this.hit(rows,/(梦渊层|ABY13)/,[450,0,650,170])&&this.hit(rows,/编队剩余/,[680,420,260,90]);}
 async digit(roi,minScore=0.8){const r=await this.v.recognize('OCR',{expected:'^[0-9]+$',roi,only_rec:true});const row=r?.detail?.best;return row&&row.score>=minScore?Number(row.text):null;}
 async formation(){await this.wait('检查编队剩余人数',()=>this.formationPage());this.status('读取编队剩余人数');let previous=null;try{return await this.wait('稳定读取编队人数',async()=>{const value=await this.digit([835,445,45,45]);if(value===null||value>10)return null;const same=previous===value;previous=value;return same?{value}:null;},15000).then(r=>r.value);}catch(e){if(e.message.startsWith('等待超时'))return null;throw e;}}
 async enterNodes(){await this.wait('编队确认',()=>this.formationPage());this.status('进入海域节点');const nodeScreen=async()=>{const rows=await this.rows();return this.hit(rows,/意识碎片/)&&this.hit(rows,/队伍配置/)&&this.hit(rows,/终止下潜/)&&this.hit(rows,/灵感节点/);};await this.clickAndConfirm(()=>point(1065,585),nodeScreen,'进入海域');this.status('进入灵感节点');await this.clickAndConfirm(()=>this.text(/灵感节点/),()=>this.inspirationPage(),'进入灵感节点');}
 async inspirationPage(rows){
  // 灵感选择页（主界面）判定：宽松阈值 + 多锚点 OR。
  // 原实现含「下一节点+推荐等级」组合；但该组合是胜利/结算页底部的常驻页脚（图1 右下角
  // 「下一节点 / 推荐等级 55」即为例证），会令本函数在胜利页上返回 true，
  // 进而使 settlement() 的非最终战斗分支误判「已进入灵感页」而提前 return、漏点「继续」，
  // 游戏卡在胜利页、下一轮 temporary() 干等 120s 超时。故删除该会误命中胜利页的锚点。
  // 主界面真实专属锚点为「剩余可选灵感数」与「本局得分+未激发」（后者在顶部/右侧，不受底部教学气泡遮挡）。
  // 可选 rows：调用方已在本轮做过识别时直接复用，避免重复整屏 OCR（结算循环内尤其重要）。
  if(!rows)rows=await this.rowsLoose(FULL,0.40);
  const any=p=>this.hit(rows,p);
  return any(/剩余可选灵感/)                    // 「剩余可选灵感数」：主界面最专属、最强锚点
      || (any(/本局得分/)&&any(/未激发/));      // 顶部得分 + 右侧未激发状态：可靠组合，不受底部气泡影响
 }
 async selectedCount(){
  const label=await this.text(/剩余可选灵感/,[250,500,780,210]);
  if(!label)return null;
  const [x,y,w,h]=label.box;
  const embedded=clean(label.text).match(/剩余可选灵感[:：]?([01])$/);
  if(embedded)return Number(embedded[1]);
  const left=Math.max(0,x+w-2),top=Math.max(0,y-10);
  return this.digit([left,top,Math.min(54,1280-left),Math.min(h+18,720-top)]);
 }
 sameCards(a,b){
  return !!a&&!!b&&a.length===b.length&&a.every((r,i)=>clean(r.text)===clean(b[i].text)&&r.box.every((n,j)=>Math.abs(n-b[i].box[j])<=3));
 }
 // 停止移动 = 卡片中心 x 位置连续若干帧稳定（不再横向位移），只比较位置、不比较文字。
 // 卡片标题常带描边/发光动画，且 OCR 文字每次识别都有抖动；若仍要求「文字+坐标」双重完全一致，
 // 在别人机器上（不同显卡渲染/字体/性能）几乎永远无法连续达成，导致 stableCards 一直超时。
 // 位置容差 tol 放宽以吸收 OCR 框抖动与惯性末段的微移（末段位移 < tol 不影响后续点击命中）。
 samePositions(a,b,tol=8){
  if(!a||!b||a.length!==b.length)return false;
  return a.every((r,i)=>{
   const ca=r.box[0]+r.box[2]/2, cb=b[i].box[0]+b[i].box[2]/2;
   return Math.abs(ca-cb)<=tol;
  });
 }
 // 逐卡精识别（定位与识别解耦）：停稳后只做一次整条标题带的宽松 OCR（阈值 0.45），
 // 再按每张卡的 x 区间把对应文字映射回去。相比原来「逐卡各做一次 OCR（N 次）」，
 // 把 N 次识别压成 1 次；识别本身（而非轮询间隔）才是耗时主因，这是提速的关键。
 // 只更新 text、沿用整行 OCR 的稳定 box；某卡在整条带里没匹配到文字则回退保留粗定位文字。
 async refineCards(cards){
  if(!cards||!cards.length)return cards;
  const all=await this.rowsLoose([0,305,1280,74],0.45);
  return cards.map(c=>{
   const [x,y,w,h]=c.box,lo=x-14,hi=x+w+14;
   const hits=(all||[]).filter(t=>{const [tx,,tw]=t.box;const cx=tx+tw/2;return cx>=lo&&cx<=hi;})
                      .sort((a,b)=>(b.score||0)-(a.score||0));
   return hits.length?{text:hits[0].text,box:c.box,score:hits[0].score}:c;
  });
 }
 async stableCards(){
  let previous=null,consecutive=0,miss=0;
  const cards=await this.wait('等待灵感卡片停止移动',async()=>{
   // 用小区域（剩余可选灵感标签 [250,500,780,210]）确认仍在灵感页，避免对每个轮询都做整屏 OCR；
   // 整屏 OCR 在「稳定化期间（多次轮询 × dragCards/selectCard/inspiration 多次调用）」会累加成显著耗时。
   // 标签是灵感页常驻 UI（滑动中也在），识别失败（瞬时抖动）时容错一次再重置稳定性计数（miss 计数）。
   if(!await this.textLoose(/剩余可选灵感/,[250,500,780,210])){miss++;if(miss>=2){previous=null;consecutive=0;miss=0;}return null;}
   miss=0;
   const cards=(await this.rows([0,315,1280,54])).filter(r=>r.box[2]>=45&&r.box[0]>8&&r.box[0]+r.box[2]<1272).sort((a,b)=>a.box[0]-b.box[0]);
   if(cards.length<2){previous=null;consecutive=0;return null;}
   consecutive=this.samePositions(previous,cards)?consecutive+1:1;previous=cards;
   return consecutive>=INS_STABLE?cards:null;
  },30000,1,true,INS_POLL);
  // 停稳后逐卡精识别（见 refineCards 注释）：定位与识别解耦，提高艺术字标题召回率。
  return await this.refineCards(cards);
 }
 async dragCards(direction){
  await this.wait('确认灵感列表可拖动',()=>this.inspirationPage(),20000,1);
  // One card-width, slow horizontal drag entirely within the card strip.
  // Await release before settling; never queue gestures or click while inertia remains.
  const start=direction<0?800:480,end=start+direction*260;
  console.log('灵感列表慢拖动',{start,end,y:300,duration:700});
  await this.v.swipe(start,300,end,300,700,'灵感列表单卡慢拖动');
  await this.sleep(300);
  return this.stableCards();
 }
 async visibleTarget(name,confirmedCards=null){
  for(let i=0;i<7;i++){
   const cards=confirmedCards||await this.stableCards();confirmedCards=null;
   const target=this.hit(cards,new RegExp('^'+name+'$'));
   if(!target)throw new Error('目标卡片移动后暂未定位：'+name);
   const center=target.box[0]+target.box[2]/2;
   if(center>=180&&center<=1100)return target;
   console.log('目标卡片在边缘，先完整移入',{name,center});
   confirmedCards=await this.dragCards(center>1100?-1:1);
  }
  throw new Error('无法将目标卡片完整移入：'+name);
 }
 async selectCard(name,confirmedCards=null){
  // 点卡后：等待 → 正常识别剩余可选灵感数 → 再判断是否选中。
  // 「阶段校验」（是否还停在上个阶段 / 是否已选中）放在正常等待与识别结束之后做，而非每次点完立即快照。
  for(let attempt=0;attempt<2;attempt++){
   const target=await this.visibleTarget(name,attempt===0?confirmedCards:null);
   const remaining=await this.selectedCount();
   if(remaining===0)return;
   if(remaining!==1)throw new Error('选择前无法确认剩余灵感数量');
   this.status('点击灵感卡片：'+name);
   await this.at(Math.round(target.box[0]+target.box[2]/2),285,'选择灵感卡片内部：'+name);
   await this.sleep(500);
   await this.stableCards();
   const after=await this.selectedCount();
   console.log('灵感点击后剩余数量',{name,attempt:attempt+1,remaining:after});
   if(after!==1)return;
   if(attempt===0)console.log('确认尚未选中，将重新定位并补点一次');
  }
 }
 async inspiration(name){
  this.status('选择灵感：'+name);
  await this.wait('选择灵感：'+name,()=>this.inspirationPage(),undefined,2,true,INS_POLL);
  const count=await this.selectedCount();if(count!==1)throw new Error('灵感剩余可选数量不是 1，停止以避免跳过或重复选择');
   let target=null;
  let cards=await this.stableCards();
  for(let pass=0;pass<2&&!target;pass++){
   let unchanged=0;
   for(let i=0;i<24&&!target;i++){
    target=this.hit(cards,new RegExp('^'+name+'$'));
    if(target)break;
    const before=cards;
    this.status('拖动查找灵感：'+name);
    cards=await this.dragCards(pass===0?-1:1);
    unchanged=this.sameCards(before,cards)?unchanged+1:0;
    if(unchanged>=2)break;
   }
  }
  if(!target)throw new Error('未找到指定灵感：'+name);
  this.status('找到灵感：'+name+'，点击选择');
  await this.selectCard(name,cards);
  // 选灵感是否成功 → 以「进入选择临时灵感页（brief 页）」为唯一判据（用户确认逻辑）：
  // 先点「继续」，再等「已离开灵感选择页」即视为已到 brief 页、进入下阶段；
  // 不再单独做「灵感已选中」模板确认（海域_灵感选中对号/选中边 偶发漏识会凭空多等 20s，且 selectCard 已用「剩余可选灵感=0」校验过选中）。
  // brief 页的可靠判据是「已离开灵感选择页」：灵感页专属锚点「剩余可选灵感 / 本局得分+未激发」均为稳定 OCR，
  // 比 brief 页艺术字标题/激发按钮可靠得多——后者偶发漏识正是此前每次选灵感空等 10~26s 的根因。
  // 用 inspirationPage() 取反判定：一旦离开灵感页即视为已到 brief 页，杜绝艺术字 OCR 漏识导致的盲等。
  // 先点继续、再判离开（而非 clickAndConfirm 的「开头即判 expected」），可避免极端 OCR 漏识时跳过「继续」点击而误点到灵感页上的风险。
  // ⚠️ clickText 签名为 clickText(pattern,label,roi)：标签与区域不可写反——此前写反导致 this.text 把字符串当 ROI，
  //    hit() 用字符做坐标比较使「继续」永远匹配不到，整轮卡 90s 后「等待超时：430,630,440,90」失败。
  this.status('确认灵感选择，点击继续');
  await this.clickText(/^继续$/,'确认灵感继续',[430,630,440,90]);
  this.status('已点击继续，等待进入选择短暂灵感页');
  await this.wait('等待进入选择临时灵感页',async()=>!(await this.inspirationPage()),20000,1,true,INS_POLL);
 }
 async temporary(){
  this.status('激发短暂灵感');
  // 阶段对账：本应在战斗前进入「短暂灵感」选择页。但游戏有时会直接推进到
  // 下个阶段（例如短暂灵感被自动选好、或上一步未正确收敛），此时若仍只死等「请选择短暂灵感」
  // 会干等 120s 超时，而游戏其实已走在前头（部署页 / 战斗中）。
  // 故等待期间同时探测「是否已到下阶段」：命中即视本步骤已完成，立即放行，不让终端卡在上一阶段。
  // 注意：advanced 只认「部署页 / 战斗中」这类明确位于短暂灵感之后的阶段，绝不含「战斗胜利/结算页」，
  // 以免把「尚未点继续的旧胜利页」误判为已推进而跳过本应执行的选灵感动作。
  // 提速：各判定均用小区域 OCR，不再对整屏做昂贵识别（原实现对每轮轮询都做整屏 rowsLoose）。
  const probeBrief=async()=>{
   // ⚠️ 关键：必须「正面识别到 brief 页」才算到达，绝不能用「!灵感页」作判据。
   // 选完灵感后游戏会先进「加载页」、加载完才是 brief 页；加载页上灵感页锚点已消失（inspirationPage 为假），
   // 若用「!灵感页」作判据会在加载页误判命中 → 去点 (475,350) 却点在加载图上 → 后续死等「激发」而卡死。
   // brief 页标志（标题「请选择…短暂灵感」/ 金色「激发」按钮）：用 rowsLoose 0.40 宽松阈值，
   // 即便艺术字 OCR 偶失，brief 页会持续停留，下一轮轮询（130ms）即能补认，不会引入额外延迟。
   const rows=await this.rowsLoose([300,110,680,540],0.40);
   if(this.hit(rows,/请选择.*短暂灵感/)||this.hit(rows,/^激发$/,[450,470,380,100]))return 'brief';
   return null;
  };
  const probeAdvanced=async()=>{
   const bottom=await this.rowsLoose([0,540,1280,180],0.40);
   if(this.hit(bottom,/可部署/,[0,540,350,180])&&this.hit(bottom,/开始作战/,[1000,570,280,150]))return true;
   const top=await this.rowsLoose([0,0,340,110],0.40);
   return !!this.hit(top,/(我方行动|敌方行动)/);
  };
  let result;
  try{
   result=await this.wait('等待短暂灵感',async()=>{
    if(await probeAdvanced())return 'advanced';   // 先判「已跳过到部署/战斗」（游戏有时自动选好短暂灵感），避免被误判为 brief 卡住
    if(await probeBrief())return 'brief';
    return null;
   },120000,1,true,130);
  }catch(e){
   if(/等待超时/.test(e.message)){
    // 等不到短暂灵感页：最后再核对一次是否已到下阶段（一次性小区域探测，不进入死等），是则放行。
    if(await probeAdvanced()){this.status('等待短暂灵感超时，但游戏已推进，跳过本步骤');return;}
    throw e;
   }
   throw e;
  }
  if(result==='advanced'){this.status('短暂灵感已提前完成，跳过选择');return;}
  const deployReady=async()=>{const rows=await this.rows();return this.hit(rows,/可部署/,[0,540,350,180])&&this.hit(rows,/开始作战/,[1000,570,280,150]);};
  // 选左侧灵感卡并激发：不再等待易失的「选中金边」模板（该模板在不同 brief 页布局下常不命中，曾导致卡死 ~90s）。
  // 改为「点左侧卡 → 点激发」，并以「进入部署页（可部署+开始作战）」为唯一成功判据（deployReady）。
  // 自愈：若左侧卡已被游戏自动选中，点击会取消选中 → 激发不推进 → 下一轮重选再激发（最多 3 轮自愈）。
  for(let a=1;a<=3;a++){
   this.status('选择左侧短暂灵感（第'+a+'次）');
   await this.at(475,350,'选择左侧短暂灵感');
   await this.sleep(250);
   // 激发按钮未出现（极少数页面切换抖动）→ 下轮重试，不空等。
   if(!(await this.isTrue(()=>this.text(/^激发$/,[450,470,380,100]),1500)))continue;
   this.status('点击激发短暂灵感（第'+a+'次）');
   await this.clickText(/^激发$/,'激发短暂灵感',[450,470,380,100]);
   if(await this.isTrue(deployReady,8000)){this.status('短暂灵感激发成功，进入部署');return;}
  }
  throw new Error('短暂灵感激发未生效（选卡或激发失败）');
 }
 async deploy(){this.status('部署并开始作战');await this.wait('部署页面',async()=>{const rows=await this.rows();return this.hit(rows,/可部署/,[0,540,350,180])&&this.hit(rows,/开始作战/,[1000,570,280,150]);},120000);this.status('点击开始作战');await this.clickAndConfirm(()=>this.text(/开始作战/,[1000,570,280,150]),()=>this.text(/我方行动|敌方行动/,[0,0,340,110]),'开始作战',{confirmMs:20000});}
 // —— 结算页多锚点识别 ——
 // 结算页与「获取物资」结果页共用一套锚点，用「阈值」判定，避免只靠「战斗胜利」被立绘/背景遮挡时长时间等待。
 // 强锚点（恒在、不被背景遮挡）：返回、继续（底部两个按钮）。
 // 弱锚点（恒在但可能被立绘/背景遮挡）：下一节点、战斗胜利、得分、获得意识碎片。
 // 单次宽松 OCR（score≥0.40）同时探测 6 个锚点；命中组合达标即认定，任一锚点落空不影响整体判定。
 // 完成页（探索完成）多锚点识别：标题「探索完成」常与 MISSION RESULTS 艺术字重叠、OCR 易失配，
 // 故增「完成节点」(完成节点 x/y) 与英文 MISSION 作辅助锚点，任一命中即认定已进入该界面（阈值 0.42 覆盖立绘干扰）。
 async completePage(){
  const rows=await this.rowsLoose([0,80,640,580],0.42);
  return this.hit(rows,/探索完成/,[0,80,640,300])||this.hit(rows,/完成节点/,[0,80,640,500])||this.hit(rows,/MISSION/i,[0,80,640,300]);
 }
 async settlementSignals(rows){
  if(!rows)rows=await this.rowsLoose(FULL,0.40);
  const find=(pat,roi)=>this.hit(rows,pat,roi);
  // 注意：cont/back/next 必须返回「识别行对象或 null」，绝不能 !! 成布尔——
  // 下方 settlement() 会把这些行对象直接交给 tap() 去点击；若传布尔/裸框会触发「缺少识别框」。
  // 这几个字段在 settlementKind() 里仅作真值判断（非 null 即真），返回行对象语义完全一致。
  return {
   victory: !!find(/战斗胜利/,[700,140,580,360]),
   score:   !!find(/得分/,[760,170,520,250]),
   shards:  !!find(/意识碎片/,[760,170,520,290]),
   next:    find(/下一节点/,[860,470,420,250])||null,
   back:    find(/^返回$/,[750,585,350,135])||null,
   cont:    find(/^继续$/,[1000,585,280,135])||null,
   rewardTitle: !!find(/获取物资/,[0,70,1280,180]),     // 获取物资确认页顶部标题
   completeTitle: !!find(/探索完成/,[0,80,640,300]),    // 完成页「探索完成」大字
   completeNode:  !!find(/完成节点/,[0,80,640,500]),     // 完成页「完成节点 x/y」
  };
 }
 // 结算页身份签名：用当前帧可见的稳定文字集合标识「这是哪一页」。不同战斗的敌人/关卡名不同 → 签名不同，
 // 用于判断「点继续后是否真的离开了本页」——签名变化即视为已推进，避免把快速连发的结算页误判为卡死。
 settlementSig(rows){return (rows||[]).map(r=>clean(r.text)).filter(t=>t&&!/^\s*$/.test(t)).sort().join('|');}
 // 判定结果页类型：
 //  'settlement' = 结算页（有返回/继续/下一节点等导航 + 胜利文字）→ 点继续推进；
 //  'reward'     = 获取物资页（无任何导航按钮、仅胜利文字，如「战斗胜利+得分+获得意识碎片」）→ 点右下角空白推进；
 //  null         = 尚未进入结果页。
 settlementKind(sig){
  if(sig.completeTitle||sig.completeNode)return 'complete';   // 完成页（探索完成/完成节点）
  // 获取物资确认页：顶部「获取物资」标题且无任何导航按钮（区别于结算页/获取物资过渡页）。
  if(sig.rewardTitle&&!sig.back&&!sig.cont&&!sig.next)return 'confirm';
  const hasNav=sig.back||sig.cont||sig.next;        // 导航锚点：返回/继续/下一节点
  const hasWin=sig.victory||sig.score||sig.shards;  // 胜利文字锚点
  if(hasNav&&hasWin)return 'settlement';            // ≥1 导航 + ≥1 胜利文字 → 结算页
  if(sig.back&&sig.cont)return 'settlement';        // 返回+继续双导航（胜利文字被遮挡也认）
  if(!hasNav&&hasWin)return 'reward';               // 无导航、仅胜利文字 → 获取物资过渡页
  return null;
 }
 // 获取物资确认页底部对号：视觉模板匹配定位（优先），失败再回退兜底坐标。
 // 该对号与奖励页「确认对号」为同一游戏 UI（金色圆环+白色对勾），复用现有模板。
 // 模板匹配对分辨率/轻微位置偏移不敏感，故用视觉方案替代硬编码坐标。
 async confirmCheckmark(){
  this.status('获取物资确认：视觉定位底部对号');
  const roi=[150,380,980,340];                       // x150-1130, y380-720：覆盖底部对号常见区域
  const tpl=['通用_奖励对号.png','领取确认_对号.png','领取确认_对号_可见上半部.png','奖励对号_核心_90.png','奖励对号_核心_100.png','奖励对号_核心_110.png'];
  let reco=null;
  for(const t of tpl){ reco=await this.v.template(t,roi,0.76); if(reco)break; }
  if(reco)return await this.v.click(reco,'获取物资确认对号');
  // 视觉未命中（极端遮挡/分辨率偏差）：回退用户标注的大致坐标
  return await this.at(653,612,'获取物资确认对号(兜底坐标)');
 }
async victory(){const sig=await this.settlementSignals();return this.settlementKind(sig)!==null;}
 async badges(){
  const reco=await this.v.template('海域_技能次数左边框.png',[880,505,300,40],0.70);
  const caps=(reco?.detail?.filtered||[]).filter(r=>r.score>=0.70).sort((a,b)=>a.box[0]-b.box[0]);
  if(!caps.length||caps.length>2)return [];
  const result=[];
  for(const cap of caps){const [x,y]=cap.box;let count=await this.digit([x+33,y-1,20,23],0.80);if(count===null)count=await this.digit([x+35,y-1,20,23],0.80);if(count===null)return [];result.push({x:x+38,y:y-32,count});}
  return result;
 }
 async battle(final){
  this.status(final?'最终战斗：每个我方回合释放灵感':'自动战斗中');const end=Date.now()+25*60*1000;const tracker=new SkillTracker();let ownPrev=false,releasedThisTurn=false,notOwnSince=0;
  while(Date.now()<end){
   this.check();
   const observation=await this.v.frame(async()=>{
    if(await this.v.loading())return {loading:true};
    const rows=await this.rowsLoose();   // 单次 OCR，放宽门槛以覆盖立绘背景干扰的结果页
    if(this.settlementKind(await this.settlementSignals(rows)))return {ended:true};  // 多锚点判定，避免「战斗胜利」被遮挡时漏判
    if(final&&this.hit(rows,/获取物资|探索完成/))return {ended:true};
    if(this.hit(rows,/战斗失败|作战失败|挑战失败/))throw new Error('战斗失败，已停止');
    const ownRow=final&&this.hit(rows,/我方行动/,[0,0,340,100]);
    const own=ownRow&&ownRow.score>=0.65;   // 「我方行动」仍用原阈值，避免与「敌方行动」混淆
    if(!own)return {};
    return {own:true,badges:await this.badges()};
   });
   if(observation.ended){this.status('战斗结束，进入结算');return;}
   if(observation.loading){await this.sleep(600);continue;}
   if(observation.own){
    const badges=observation.badges;
    tracker.clearIfConsumed(badges);
    // 离开我方回合超过 3s 才视为「真正的回合切换」，规避动画导致的单帧抖动误判；
    // 短于 3s 的闪烁不重置，避免同一回合重复释放。
    if(!ownPrev&&notOwnSince&&Date.now()-notOwnSince>3000)releasedThisTurn=false;
    if(!releasedThisTurn&&!tracker.pending&&badges.length){
     const target=tracker.pick(badges);
     if(target){await this.at(target.x,target.y,'最终战斗释放灵感');releasedThisTurn=true;tracker.pending={...target};tracker.pendingSince=Date.now();this.status('最终战斗：已释放灵感，等待本回合消耗');}
    }
    ownPrev=true;notOwnSince=0;
   }else{
    ownPrev=false;notOwnSince=notOwnSince||Date.now();
   }
   await this.sleep(final?350:700);
  }throw new Error('战斗等待超过 25 分钟');
 }
 async settlement(final){
  this.status('战斗结算');
  // 第一次等待：确认进入结果页（战斗胜利 / 获取物资 / 探索完成）。超时与轮询间隔均调低，
  // 让「进入结果页」这一步尽快确认；真正的「试探（点继续位置）+ 后续等待」只在此确认之后才进行。
  await this.wait('等待战斗结算',async()=>await this.victory()||(final&&(await this.v.reward()||await this.completePage())),45000,2,true,100);
  // 每轮循环只在顶部做一次识别（正常识别）；「是否卡在同页」用本轮签名与上轮签名对比，
  // 在正常识别结果上做，而非每次动作后再额外 OCR（额外 OCR 既刷爆耗时，也易在右下角误点）。
  // frozen 记录「连续识别到同一页」的次数，仅当真正卡死（签名不变）才抛错，
  // 避免把快速连发的多场结算页误判为卡死（每页签名不同会重置 frozen）。
  const end=Date.now()+180000; let frozen=0; const MAXF=12; let lastSig=null; let probes=0; let showTries=0; let pageNo=0;
  while(Date.now()<end){this.check();
   try{   // 兜底：循环体内点击若仍撞上过场加载（PAGE_TRANSITION），等待后重轮，而非让错误冒泡成「任务失败」
    if(await this.v.loading()){await this.sleep(600);continue;}
    if(await this.v.reward()){await this.v.rewardClick();await this.sleep(800);lastSig=null;frozen=0;probes=0;continue;}
    const rows=await this.rowsLoose(FULL,0.40);   // 每轮唯一识别点（正常识别），供下方所有判定复用
    if(final&&await this.completePage())return;   // 完成页（探索完成/完成节点/MISSION）
    if(!final){
     // 已在选择页（面板展开）→ return，交由下一轮 inspiration 流程。标题/激发/隐藏灵感/剩余可选灵感/本局得分+未激发 任一命中即认定，
     // 避免只靠标题被背景遮挡时误走下方「点右下角探测」，把「隐藏灵感」当「继续」点掉、收起面板。
     // 「本局得分」在顶部、「未激发」在右侧，均不受底部教学气泡遮挡，作为底部锚点（剩余可选灵感/下一节点/推荐等级）漏识时的可靠兜底。
     if(this.hit(rows,/请选择.*短暂灵感/)||this.hit(rows,/^激发$/,[450,470,380,100])||this.hit(rows,/隐藏灵感/,[1000,620,280,100])||this.hit(rows,/剩余可选灵感/)||(this.hit(rows,/本局得分/)&&this.hit(rows,/未激发/)))return;
     // 面板被收起（部署界面，右下角是「选择灵感」）→ 点它重新展开，回到灵感选择界面。
     const showBtn=this.hit(rows,/选择灵感/,[1000,620,280,100]);
     if(showBtn){
      if(++showTries>8)throw new Error('灵感面板展开未生效（连续点击「选择灵感」无效果）');
      this.status('结算中发现灵感面板被收起，展开（选择灵感）');
      await this.tap(showBtn,'展开灵感面板（选择灵感）');
      await this.sleep(900);
      lastSig=null; frozen=0; probes=0; continue;
     }
     showTries=0;
    }
    const sig=await this.settlementSignals(rows);
    const kind=this.settlementKind(sig);
    if(kind==='complete')return;                  // 完成页（settlementKind 已识别，交由 finish 关闭）
    if(kind===null){
      // 未识别到任何结果页。先排除灵感面板开关（右下角，与结算「继续」位置冲突）；
      // 关键闸门：只有「确实仍在结果页」才做盲点试探（点 1115,665）——若本轮已无任何结果页信号，
      // 说明游戏已离开结算页（甚至可能已到海域地图，而 1115,665 恰好是「开始下潜」按钮），
      // 此时绝不能再盲点，否则会反复误点开始下潜。无信号时改为：确认是否已在地图（是则直接退出结算，
      // 交由 finish / 下一轮 处理），否则静等游戏自行推进。
      if(this.hit(rows,/隐藏灵感|选择灵感/,[1000,620,280,100])){await this.sleep(450);continue;}
      const onResultPage=sig.victory||sig.score||sig.shards||sig.back||sig.cont||sig.next||sig.rewardTitle||sig.completeTitle||sig.completeNode;
      if(onResultPage&&probes<2){probes++;this.status('结算：结果页未识别，试探继续位置');await this.at(1115,665,'结果页未识别-尝试继续位置');await this.sleep(1400);lastSig=null;continue;}
      if(this.hit(rows,/意识碎(?:片)?/,[0,490,370,230])&&this.hit(rows,/(ABY13|梦渊层)/))return;  // 已在海域地图：游戏已离开结算，退出交由上层处理
      await this.sleep(450);continue;
    }
    probes=0;                                      // 识别到结果页，重置「未识别」计数
    // —— 阶段校验：在本轮正常识别结果上做（非每次动作后额外 OCR）——
    // 本轮签名与上轮相同 => 上一动作未生效（仍卡在同页），累加；换签名 => 已推进到新页，清零。
    const cur=this.settlementSig(rows);
    if(cur===lastSig){ if(++frozen>MAXF)throw new Error('结算推进未生效（连续停留在同一结算页）'); }
    else { frozen=0; }
    lastSig=cur;
    if(kind==='settlement'){                       // 结算页：点继续推进（继续按钮偶发缺失则点原空白区）
      this.status('结算：点击继续（第'+(++pageNo)+'页）');
      if(sig.cont)await this.tap(sig.cont,'胜利结算继续');
      else await this.at(1115,665,'胜利结算空白继续区');
    }
    else if(kind==='reward'){                      // 获取物资过渡页：无返回/继续，点右下角原「继续」位置推进
      this.status('结算：获取物资推进（第'+(++pageNo)+'页）');
      await this.at(1115,665,'获取物资推进');
    }
    else if(kind==='confirm'){                     // 获取物资确认页：顶部「获取物资」+ 底部对号，视觉定位点对号
      this.status('结算：确认获取物资（第'+(++pageNo)+'页）');
      await this.confirmCheckmark();
    }
    await this.sleep(1600);
   }catch(e){ if(e&&e.code==='PAGE_TRANSITION'){await this.sleep(600);continue;} throw e; }
  }throw new Error('结算页面未能完成');
 }
 async finish(){this.status('完成，返回海域地图');await this.wait('探索完成',()=>this.completePage());await this.at(120,580,'关闭探索完成');await this.wait('返回海域地图',()=>this.map(),120000);}
}
module.exports={SeaPort,point};

