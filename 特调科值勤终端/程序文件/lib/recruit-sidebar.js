const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {sleep} = require('./flow');
const SIDEBAR=[20,70,210,650]; // 侧栏可见全高 OCR 区域；不再靠固定下界“够到”外部招募，而靠滚动收敛取末条
const externalLabel=v=>v.ocr('.*外部招募.*',SIDEBAR);
async function settledLabel(v){
  try{return await v.wait(()=>externalLabel(v),'左栏外部招募标签',{timeout:1800,stable:1});}
  catch(error){if(error.code!=='RESULT_TIMEOUT')throw error;return null;}
}
// 测试开关：置为 true 时跳过「外部招募」文字 OCR，直接进入降级定位流程（仅供实测降级流程用）。
// 正式包恒为 false。当前盒式定位已不依赖文字，此开关仅作历史兼容保留。
const FORCE_FALLBACK=false;
// 调试开关：置为 true 时，侧栏池子框收敛到底后输出「识别效果图」(HTML，底图+矩形框标注)，
// 用于直观验收盒式识别是否正确。仅测试包开启，正式包恒为 false。
const DEBUG_SIDEBAR_EFFECT=false;
// 侧栏池子行聚类间距：相邻文字纵向间隔 <= 此值(px)视为同一池子框（同一池子的名称+副标题会聚成一行）。
const ROW_GAP=18;
// 兜底锚点：后台截图恒归一化到 1280×720，故列表可视区底部各机器一致。
// 「外部招募」恒为最后一个池子；当列表条数足以铺满/需要滚动时，末条就停在可视区底部。
const BOTTOM_BOX=[50,665,130,40];
const SIDEBAR_BOTTOM_LIMIT=710; // 侧栏可视区下沿（SIDEBAR 的 y+height）
// 降级定位的状态记忆：存在程序文件根目录（每台机器各自独立解压，故记忆天然按机器隔离）。
// preferFallback：用户已确认「以后直接走降级流程」——由 UI 在整轮结束后弹窗询问，点「是」后写入；
//   下次运行时 enterExternal 读到 true 即跳过 OCR 直接降级。
// fallbackTriggeredThisRun：本轮「OCR 失效、实际进入降级流程」的标记，由 UI 在整轮结束后读取弹窗；
//   仅当 OCR 真的失效（非测试强制 FORCE_FALLBACK、非用户已确认切换）时才置 true。
const FALLBACK_PREFS=path.join(__dirname,'..','外部招募降级状态.json');
function loadFallbackPrefs(){
  try{
    const p=JSON.parse(fs.readFileSync(FALLBACK_PREFS,'utf8'));
    return {preferFallback:!!p.preferFallback,fallbackTriggeredThisRun:!!p.fallbackTriggeredThisRun};
  }catch(_){return {preferFallback:false,fallbackTriggeredThisRun:false};}
}
function saveFallbackPrefs(p){
  try{fs.writeFileSync(FALLBACK_PREFS,JSON.stringify(p,null,2));}
  catch(e){console.log('外部招募降级状态保存失败：'+e.message);}
}
// 刷新「本轮是否触发降级」标记：每次运行都写一次 true/false，避免上一轮残留影响本轮。
function setFallbackTriggered(flag){
  const p=loadFallbackPrefs();
  if(!!p.fallbackTriggeredThisRun===!!flag)return;
  saveFallbackPrefs({preferFallback:p.preferFallback,fallbackTriggeredThisRun:!!flag});
}
// 侧栏里所有可辨识的条目（池子名/标签），按纵向位置升序。
// 过滤掉「0/4」这类数量徽标与 OCR 噪声，只留像条目文字的结果。
async function sidebarItems(v){
  try{
    const reco=await v.ocr('.*',SIDEBAR);
    const all=(reco&&reco.detail&&reco.detail.all)||[];
    return all
      .filter(e=>e&&Array.isArray(e.box)&&e.box.length===4&&typeof e.text==='string')
      .map(e=>({text:e.text.trim(),box:e.box}))
      .filter(e=>e.text.length>=2)
      .filter(e=>!/^[0-9\s/／:：.、%\-—]+$/.test(e.text))
      .filter(e=>e.box[3]>=10)
      .sort((a,b)=>a.box[1]-b.box[1]);
  }catch(_){return [];}
}
// 侧栏池子框识别（盒式）：每个池子在侧栏里是一个长方形框，文字会随池子变化但框的位置/结构稳定。
// 做法：OCR 整个侧栏，把识别到的文字按纵向位置聚成“行”，每一行即一个池子框（横向铺满侧栏），
// 末行 = 最底部池子 = 外部招募（恒为最后一个）。不依赖认出具体文字，只靠框的几何位置选末框。
async function poolBoxes(v){
  try{
    const reco=await v.ocr('.*',SIDEBAR);
    const all=(reco&&reco.detail&&reco.detail.all)||[];
    const items=all
      .filter(e=>e&&Array.isArray(e.box)&&e.box.length===4&&typeof e.text==='string')
      .map(e=>({text:e.text.trim(),box:e.box}))
      .filter(e=>e.box[0]>=SIDEBAR[0]-20 && e.box[0]+e.box[2]<=SIDEBAR[0]+SIDEBAR[2]+20)
      .filter(e=>e.text.length>=1)
      .filter(e=>/[一-鿿]/.test(e.text) || (e.text.length>=2 && !/^[0-9\s/／:：.、%\-—]+$/.test(e.text)));
    items.sort((a,b)=>a.box[1]-b.box[1]);
    const rows=[];
    for(const it of items){
      const top=it.box[1], bottom=it.box[1]+it.box[3];
      const last=rows[rows.length-1];
      if(last && top<=last.bottom+ROW_GAP){
        last.bottom=Math.max(last.bottom,bottom);
        last.texts.push(it.text);
      }else{
        rows.push({top,bottom,texts:[it.text]});
      }
    }
    const x=SIDEBAR[0], w=SIDEBAR[2], yTop=SIDEBAR[1], yBot=SIDEBAR[1]+SIDEBAR[3];
    return rows
      .map(r=>{
        const top=Math.max(yTop,r.top-3), bottom=Math.min(yBot,r.bottom+3);
        return {box:[x,top,w,bottom-top],texts:r.texts};
      })
      .filter(b=>b.box[3]>=8);
  }catch(_){return [];}
}
// 输出侧栏池子框识别效果图：把当前侧栏截图作为底图，叠加每个池子框的矩形标注，
// 末框（目标=外部招募）用红色高亮，其余用青色，并标注序号与识别到的文字。单文件 HTML，可直接浏览器打开。
async function saveSidebarEffect(v,boxes,meta={}){
  try{
    const dir=path.join(__dirname,'..','日志记录','诊断');
    fs.mkdirSync(dir,{recursive:true});
    const buf=await v.capture();                 // 当前侧栏截图（PNG buffer）
    const b64=Buffer.from(buf).toString('base64');
    const rects=boxes.map((b,i)=>{
      const [x,y,w,h]=b.box;
      const isTarget=(i===boxes.length-1);
      const stroke=isTarget?'#ff3b30':'#00e5ff';
      const fill=isTarget?'rgba(255,59,48,0.18)':'rgba(0,229,255,0.10)';
      const label=(b.texts&&b.texts.join('/'))||'(无文字)';
      return `<g>`+
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${isTarget?4:2}"/>`+
        `<text x="${x+6}" y="${y+20}" fill="${stroke}" font-size="18" font-family="sans-serif">#${i+1}${isTarget?' ★目标':''} ${label}</text>`+
        `</g>`;
    }).join('\n');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>侧栏识别效果</title>`+
      `<style>body{margin:0;background:#111;color:#eee;font-family:sans-serif}img{display:block}`+
      `h3{padding:8px 12px;margin:0;background:#222;font-size:14px}</style></head><body>`+
      `<h3>侧栏池子框识别效果 ｜ round=${meta.round??'?'} 到底=${!!meta.atBottom} 时间=${new Date().toLocaleTimeString()}</h3>`+
      `<div style="position:relative;width:1280px">`+
      `<svg viewBox="0 0 1280 720" width="1280" style="position:absolute;left:0;top:0">${rects}</svg>`+
      `<img src="data:image/png;base64,${b64}" style="width:1280px"/></div></body></html>`;
    fs.writeFileSync(path.join(dir,'侧栏识别效果.html'),html);
    console.log('已输出侧栏识别效果图：日志记录/诊断/侧栏识别效果.html（共 '+boxes.length+' 个池子框，末框为目标）');
  }catch(e){console.log('侧栏识别效果图输出失败：'+e.message);}
}
// 侧栏“画面指纹”：用池子框的几何配置（各行中心 y + 框数量）判定，不依赖文字内容。
// 两次滑动后指纹不变 => 列表已到底，再滑也不会有新条目出现。
async function sidebarSignature(v){
  const boxes=await poolBoxes(v);
  if(!boxes.length)return null;
  return boxes.map(b=>Math.round((b.box[1]+b.box[3]/2)/10)).join(',')+'#'+boxes.length;
}
// 只向下滑（手指上滑=列表下滚），直到指纹不再变化即确认到底。
async function scrollToBottom(v,pause){
  let previous=null;
  for(let i=0;i<12;i++){
    v.s.check();
    await v.wait(async()=>!await v.loading(),'招募列表稳定后滑动',{timeout:5000});
    const signature=await sidebarSignature(v);
    if(signature&&signature===previous){
      console.log(`招募左栏已确认滑到底（第 ${i} 次滑动后内容不再变化）`);
      return true;
    }
    previous=signature;
    const result=await v.swipe(130,590,130,220,600,'招募列表下滑');
    if(!result.succeeded)throw new Error('招募列表滑动失败');
    await pause(700);v.s.check();
  }
  console.log('招募左栏滑动已达上限，按已到底处理');
  return false;
}
const boxKey=box=>box.map(n=>Math.round(n/6)).join(',');
// 降级候选点位，按可信度从高到低：
// 1) OCR 直接认出的「外部招募」标签（正式流程可用，测试模式禁用）
// 2) 侧栏最靠下的可读条目（外部招募恒为最后一个池子，正常就是它）
// 3) 最靠下可读条目往下一行（当外部招募本身没被认出来、列表又没铺满时用它）
// 4) 列表可视区底部固定锚点
// 每个点位点完都会做页面校验，点错不会造成任何消耗，可安全依次尝试。
async function fallbackCandidates(v,allowOcrLabel){
  const list=[];
  if(allowOcrLabel){
    const label=await externalLabel(v);
    const box=label&&label.detail&&label.detail.best&&label.detail.best.box;
    if(box)list.push({box,via:'OCR「外部招募」标签'});
  }
  const items=await sidebarItems(v);
  if(items.length){
    const last=items[items.length-1];
    list.push({box:last.box,via:`侧栏最底部可读条目「${last.text}」`});
    if(items.length>=2){
      const first=items[0];
      const row=Math.max(40,Math.min(110,(last.box[1]-first.box[1])/(items.length-1)));
      const y=last.box[1]+row;
      if(y+last.box[3]<=SIDEBAR_BOTTOM_LIMIT)
        list.push({box:[last.box[0],y,last.box[2],last.box[3]],via:'最底部条目的下一行(推算)'});
    }
  }
  list.push({box:BOTTOM_BOX,via:'列表底部固定锚点'});
  const seen=new Set();
  return list.filter(c=>{
    const key=boxKey(c.box);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
// 降级进入：依次尝试候选点位，每次点完都用「外部招募页」判据校验。
// 全部不匹配则立即返回主页——全程只点卡池条目（浏览行为），绝不碰任何付费按钮。
async function fallbackEnter(v,marker,{allowOcrLabel=true,attempts=3}={}){
  const tried=new Set();
  for(let i=0;i<attempts;i++){
    try{
      await v.wait(async()=>!await v.loading(),'招募列表稳定',{timeout:5000});
    }catch(_){}
    const candidates=await fallbackCandidates(v,allowOcrLabel);
    const next=candidates.find(c=>!tried.has(boxKey(c.box)));
    if(!next)break;
    tried.add(boxKey(next.box));
    console.log('外部招募降级定位：尝试点击 '+JSON.stringify({via:next.via,box:next.box,attempt:i+1}));
    try{
      await v.click({detail:{best:{box:next.box}}},'外部招募(降级定位)');
    }catch(e){
      console.log('外部招募降级定位：点击未发出 '+e.message);
      continue;
    }
    try{
      const page=await v.wait(marker,'进入外部招募页确认',{timeout:8000});
      console.log('外部招募降级定位：已进入外部招募页 '+JSON.stringify({点位:next.via,依据:page&&page.via}));
      if(FORCE_FALLBACK){
        // 测试包：把这一屏 1280×720 原图存下来，便于日后精确裁剪/校准模板。
        try{
          const dir=path.join(__dirname,'..','日志记录','诊断');
          fs.mkdirSync(dir,{recursive:true});
          await v.capture(path.join(dir,'外部招募页_模板源图.png'));
          console.log('已保存外部招募页源图：日志记录/诊断/外部招募页_模板源图.png');
        }catch(e){console.log('外部招募页源图保存失败：'+e.message);}
      }
      return true;
    }catch(_){
      console.log('外部招募降级定位：点击后未进入外部招募页，换下一点位 '+JSON.stringify({点位:next.via}));
    }
  }
  console.log('外部招募降级定位：所有候选点位均未进入外部招募页，返回主界面');
  await v.homeReturn().catch(()=>{});
  return false;
}
// 「外部招募页」判据：只用外部招募页**独有**的特征，任何其他付费池子页也会出现的元素一律不用。
// 坐标均基于 1280×720 后台截图实测（大标题「外部招募」y≈378-425、英文副标题 y≈428-455、
// 状态按钮「启动招募/任务已满/招募成功」在右侧招募面板下部 [800,400,480,320]）。
// 两条腿走路：模板匹配不认字、不受描边艺术字影响；OCR 不依赖像素完全一致、皮肤/画质变化时仍能兜底。
// 刻意排除（不稳定/其他池子也有，单独拿来当页面判据会误判）：
//   - 「下次招募完成」倒计时：外部招募槽满时不会显示，不能作为恒定判据；
//   - 「招募详情」按钮（用户实测确认别的池子也有，仅大小不同）；
//   - 槽位状态文字（招募中 / 空席 / 空闲）。
// 这些只留作招募循环内部的状态分支，绝不参与「是否已进入外部招募页」的判定。
const TITLE_TPL='招募_外部招募标题.png';   // 「外部招募」+「EXTERNAL RECRUIT」文字块（裁掉场景背景）
const TITLE_ROI=[320,345,410,135];
const STATE_ROI=[800,400,480,320];         // 启动招募/任务已满/招募成功（外部招募页独有状态按钮）
async function externalPage(v){
  const strong=[
    ['外部招募标题(模板匹配)',async()=>await v.template(TITLE_TPL,TITLE_ROI,0.70)],
    ['状态按钮 启动招募/任务已满/招募成功',async()=>await v.ocr('^(启动招募|任务已满|招募成功)$',STATE_ROI)],
    ['EXTERNAL RECRUIT 英文副标题',async()=>await v.ocr('.*EXTERNAL.*',[350,415,340,60])],
    ['外部招募 中央大标题',async()=>await v.ocr('.*外部招募.*',[340,360,370,90])],
  ];
  for(const [via,probe] of strong){
    const reco=await probe();
    if(reco)return {via,text:(reco&&reco.detail&&reco.detail.best&&reco.detail.best.text)||via};
  }
  return null;
}
// ===== 视觉识别（不依赖 OCR 文字）=====
// 侧栏每个池子是一张带金色边框的卡片；「外部招募」恒为最后一个池子。
// 算法只依赖这一条铁律，对池子「数量」和「卡片高度/位置」不做任何固定假设：
//  1) 扫描整条侧栏，收集所有金色细线（卡片上下边框）；
//  2) 取最底部的金边当候选下边框，再找它「最近的上方金边」配对成一张卡片的完整框
//     （最近上方=同一卡片上边框，卡片多高都自适应，不写死高度区间）；
//  3) 最底部的完整框 = 外部招募（身份靠「位置最后」而非任何文字/固定坐标）。
//  若最低金边下方一路到底仍有金 → 判定外部招募被底部裁掉，点击点下移到金边下方。
//  点完仍用 externalPage 校验兜底，进错只回主界面、绝不点付费。
const VISUAL_X0=40, VISUAL_X1=210;      // 侧栏卡片横向范围（避开屏幕左缘与右侧立绘）
const VISUAL_Y_BOTTOM=718, VISUAL_Y_TOP=70; // 侧栏可视区纵向扫描范围（起点取视口最底部，卡片滚到边缘时也能扫到）
const VISUAL_BELOW_GAP=6;                   // 检测线下方探测行数：用于判断卡片是否延伸到视口外
const VISUAL_TEXT_OFFSET=10;                // 卡片被裁掉时，检测线(卡片内文字)到卡片中心的偏移
const VISUAL_CLICK_MAX=712;                 // 点击点上限，避免贴到视口最边缘
const VISUAL_GOLD_MIN=15;               // 一行内金色像素数阈值（170px 宽度内约 9%）
const VISUAL_BAND_MAX_ROWS=6;   // 金边是 1~数 px 细线；厚金块（立绘/高光）行数远超此值，排除
const VISUAL_CARD_HALF=36;       // 卡片半高兜底默认值（仅当侧栏里测不到任何卡片间距时使用）
// 卡片高度自适应：不写死固定半高/固定配对窗口，只设「合理范围」的上下限排除噪声/跨卡片误配。
const VISUAL_MIN_CARD=18;        // 同卡片上下金边最小间距（小于此视为同一条/噪声）
const VISUAL_MAX_CARD=240;       // 同卡片上下金边最大间距（远大于此视为跨卡片，正常侧栏总高仅约 650px，不会超）
// 零依赖 PNG 解码：后台截图恒为 1280×720、8bit、RGB(2)或RGBA(6)、非隔行。
function decodePng(buf){
  if(buf.toString('ascii',1,4)!=='PNG')throw new Error('视觉识别：截图不是有效 PNG');
  let pos=8,width=0,height=0,bitDepth=0,colorType=0;const idat=[];
  while(pos<buf.length){
    const len=buf.readUInt32BE(pos);const type=buf.toString('ascii',pos+4,pos+8);const data=buf.slice(pos+8,pos+8+len);
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];}
    else if(type==='IDAT')idat.push(data);
    else if(type==='IEND')break;
    pos+=12+len;
  }
  const channels={2:3,6:4,0:1}[colorType];
  if(!channels||bitDepth!==8)throw new Error(`视觉识别：不支持的 PNG 格式 bit=${bitDepth} colorType=${colorType}`);
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const stride=width*channels;const out=Buffer.alloc(height*stride);let p=0;
  for(let y=0;y<height;y++){
    const filter=raw[p++];const lineStart=y*stride;
    for(let i=0;i<stride;i++){
      const x=raw[p+i];
      const a=i>=channels?out[lineStart+i-channels]:0;
      const b=y>0?out[lineStart-stride+i]:0;
      const c=(y>0&&i>=channels)?out[lineStart-stride+i-channels]:0;
      let v;
      if(filter===0)v=x;
      else if(filter===1)v=x+a;
      else if(filter===2)v=x+b;
      else if(filter===3)v=x+((a+b)>>1);
      else if(filter===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v=x+(pa<=pb&&pa<=pc?a:pb<=pc?b:c);}
      else throw new Error('视觉识别：未知 PNG 过滤器 '+filter);
      out[lineStart+i]=v&0xff;
    }
    p+=stride;
  }
  return {width,height,channels,data:out};
}
// 金色边框像素判定：暖色且红蓝差明显（覆盖不同机器渲染的抗锯齿偏差，宽松阈值）。
function isGoldPixel(data,channels,width,x,y){
  const i=(y*width+x)*channels;
  const r=data[i],g=data[i+1],b=data[i+2];
  return r>g && (r-b)>40;
}
// 收集侧栏扫描区内所有「金色细线」边框：逐行统计金色像素，连续 ≥阈值的行聚成一条带，
// 只保留细带（run<=BAND_MAX_ROWS，排除立绘等大块金色），返回每条带的 {y0,y1,cy}（自顶向下）。
function goldBands(data,channels,width,height){
  const H=Math.min(VISUAL_Y_BOTTOM,height-1);
  const rows=new Int32Array(H-VISUAL_Y_TOP+1);
  for(let y=VISUAL_Y_TOP;y<=H;y++){
    let gold=0;
    for(let x=VISUAL_X0;x<=VISUAL_X1;x++)if(isGoldPixel(data,channels,width,x,y))gold++;
    rows[y-VISUAL_Y_TOP]=gold;
  }
  const bands=[];
  let i=VISUAL_Y_TOP;
  while(i<=H){
    if(rows[i-VISUAL_Y_TOP]>=VISUAL_GOLD_MIN){
      let j=i;
      while(j<=H && rows[j-VISUAL_Y_TOP]>=VISUAL_GOLD_MIN)j++;
      if(j-i<=VISUAL_BAND_MAX_ROWS)bands.push({y0:i,y1:j-1,cy:Math.round((i+j-1)/2)});
      i=j;
    }else i++;
  }
  return {bands,rows,H};
}
// 估算侧栏里「卡片典型半高」：取相邻金边间距的中位数（卡片体高/卡片间距都落在此区间），
// 半数用于兜底（只测得一条金边时推断卡片高度）。不写死，随池子数量自适应；无可用数据回退 VISUAL_CARD_HALF。
function estimateCardHalf(bands){
  const gaps=[];
  for(let i=0;i<bands.length-1;i++){
    const d=bands[i+1].y0-bands[i].y1;
    if(d>=VISUAL_MIN_CARD && d<=VISUAL_MAX_CARD)gaps.push(d);
  }
  if(!gaps.length)return VISUAL_CARD_HALF;
  gaps.sort((a,b)=>a-b);
  const med=gaps[Math.floor(gaps.length/2)];
  return Math.max(18,Math.round(med/2));
}
// 视觉定位「外部招募」卡片（框检测，纯逻辑）：输入已解码截图数据，返回 {box,bottomY,centerY,clipped,bands}；找不到返回 null。
// 唯一前提：外部招募恒为最后一个池 → 取最底部完整框。卡片数量/高度/位置均不写死，全部自适应。
function detectExternalFromData(data,channels,width,height){
  const {bands,rows,H}=goldBands(data,channels,width,height);
  if(!bands.length){
    console.log('外部招募视觉识别：侧栏未检测到任何金色边框');
    return null;
  }
  const last=bands[bands.length-1];           // 最低一条金边（候选下边框）
  const half=estimateCardHalf(bands);         // 卡片半高自适应估值（兜底用）
  // 若最低金边下方一直到视口底仍有金色，说明它是被裁卡片的「上金边」（卡片主体延伸出视口），
  // 外部招募整体被底部裁掉：直接把点击点下移到金边下方，避免误当成上一池。
  let goldBelowToEdge=false;
  for(let y=last.y1+1;y<=H;y++){if(rows[y-VISUAL_Y_TOP]>=VISUAL_GOLD_MIN){goldBelowToEdge=true;break;}}
  if(goldBelowToEdge){
    const c=Math.min(last.cy+half,VISUAL_CLICK_MAX);
    const box=[VISUAL_X0,Math.max(0,c-half),VISUAL_X1-VISUAL_X0,half*2];
    console.log('外部招募视觉识别(框检测·下方延伸裁剪)：最低金边 y='+last.cy+' 下方仍有卡片主体，点击点下移 y='+c);
    return {box,bottomY:last.y1,centerY:c,clipped:true,bands};
  }
  // 配对：取「最近的上方金边」作为同一卡片的上边框。卡片多高都自适应（不卡写死高度区间），
  // 仅排除过小噪声与跨卡片的过大间距。外部招募恒为最后一个池 → 最底部的完整框即目标。
  let topBand=null,bestDist=Infinity;
  for(const b of bands){
    if(b.y1>=last.y0)continue;                 // 必须在 last 之上
    const dist=last.y0-b.y1;
    if(dist>=VISUAL_MIN_CARD && dist<=VISUAL_MAX_CARD && dist<bestDist){topBand=b;bestDist=dist;}
  }
  let box,centerY,clipped=false,bottomY=last.y1;
  if(topBand){
    const top=topBand.y0,bottom=last.y1;
    box=[VISUAL_X0,Math.max(0,top),VISUAL_X1-VISUAL_X0,bottom-top];
    centerY=Math.round((top+bottom)/2);
    console.log('外部招募视觉识别(框检测)：上金边 y='+top+' 下金边 y='+bottom+' 框高='+(bottom-top)+' 中心 y='+centerY);
  }else{
    // 兜底：上方无配对金边。先判是否裁剪（下方探到金），否则以上金边当底边、上推自适应半高。
    for(let y=last.y1+1;y<=Math.min(last.y1+VISUAL_BELOW_GAP,H);y++){
      if(rows[y-VISUAL_Y_TOP]>=VISUAL_GOLD_MIN){clipped=true;break;}
    }
    centerY=clipped ? Math.min(last.cy-VISUAL_TEXT_OFFSET,VISUAL_CLICK_MAX) : (last.cy-half);
    box=[VISUAL_X0,Math.max(0,centerY-half),VISUAL_X1-VISUAL_X0,half*2];
    console.log('外部招募视觉识别(框检测·单金边兜底)：金线 y='+last.cy+'（'+(clipped?'裁剪':'完整')+'）中心 y='+centerY+' 半高='+half);
  }
  return {box,bottomY,centerY,clipped,bands};
}
// 截图 → 视觉定位外部招募卡片（对外入口）。
async function visualDetectExternal(v){
  try{
    const ab=await v.capture();
    const buf=Buffer.from(ab);
    const {width,height,channels,data}=decodePng(buf);
    return detectExternalFromData(data,channels,width,height);
  }catch(e){
    console.log('外部招募视觉识别失败：'+e.message);
    return null;
  }
}
// 输出视觉识别效果图：底图 + 检测到的金色像素行 + 下边框线 + 卡片框（红色=视觉定位的目标卡片）。
async function saveVisualEffect(v,visual,boxes,meta={}){
  try{
    const dir=path.join(__dirname,'..','日志记录','诊断');
    fs.mkdirSync(dir,{recursive:true});
    const ab=await v.capture();
    const b64=Buffer.from(ab).toString('base64');
    const [bx,by,bw,bh]=visual.box;
    const boxRects=(boxes||[]).map((b,i)=>`<rect x="${b.box[0]}" y="${b.box[1]}" width="${b.box[2]}" height="${b.box[3]}" fill="rgba(0,229,255,0.08)" stroke="#00e5ff" stroke-width="2"/>`).join('');
    const bandLines=(visual.bands||[]).map(b=>`<line x1="${VISUAL_X0}" y1="${b.cy}" x2="${VISUAL_X1}" y2="${b.cy}" stroke="#ffd400" stroke-width="1.5" stroke-dasharray="5 3"/>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>视觉识别效果</title>`+
      `<style>body{margin:0;background:#111;color:#eee;font-family:sans-serif}img{display:block}h3{padding:8px 12px;margin:0;background:#222;font-size:14px}</style></head><body>`+
      `<h3>视觉识别效果 ｜ 金线y=${visual.bottomY} 中心y=${visual.centerY} ${visual.clipped?'（卡片被底部裁剪）':'（卡片完整可见）'} round=${meta.round??'?'}</h3>`+
      `<div style="position:relative;width:1280px">`+
      `<svg viewBox="0 0 1280 720" width="1280" style="position:absolute;left:0;top:0">`+
      bandLines+
      `<line x1="${VISUAL_X0}" y1="${visual.bottomY}" x2="${VISUAL_X1}" y2="${visual.bottomY}" stroke="#ff0" stroke-width="3"/>`+
      `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="rgba(255,59,48,0.18)" stroke="#ff3b30" stroke-width="4"/>`+
      `<text x="${bx+6}" y="${by+20}" fill="#ff3b30" font-size="18" font-family="sans-serif">★视觉目标(外部招募)</text>`+
      boxRects+`</svg>`+
      `<img src="data:image/png;base64,${b64}" style="width:1280px"/></div></body></html>`;
    fs.writeFileSync(path.join(dir,'视觉识别效果.html'),html);
    console.log('已输出视觉识别效果图：日志记录/诊断/视觉识别效果.html');
  }catch(e){console.log('视觉识别效果图输出失败：'+e.message);}
}
async function enterExternal(v,marker,{pause=sleep}={}){
  if(await marker())return;
  // 唯一可靠判据：主页左上角「主界面按钮」消失即为进入子界面（招募）。
  if(await v.home()){
    await v.step(()=>v.homeButton('recruit'),async()=>!await v.home(),'打开招募界面');
  }
  // 定位流程（用户指定）：
  //   1) 每屏先 OCR 整个侧栏（盒式聚成池子框），若某框文字为「外部招募」→ 点进并以 externalPage 校验；
  //   2) OCR 没识别到 → 向下滑动累积滚动，让外部招募上移进可视区；
  //   3) 滑到底（指纹不变）后仍未被 OCR 命中 → 从下往上「视觉识别」金色边框卡片（外部招募恒为最后一个），
  //      点卡片中心并以 externalPage 校验；
  //   4) 全程只点卡池条目（浏览行为），绝不碰任何付费按钮；失败则回主界面，由 UI 跑完后弹窗告知。
  let prevSig=null, misfire=0;
  for(let i=0;i<24;i++){
    v.s.check();
    await v.wait(async()=>!await v.loading(),'招募列表稳定',{timeout:5000}).catch(()=>{});
    const boxes=await poolBoxes(v);
    const sig=boxes.map(b=>Math.round((b.box[1]+b.box[3]/2)/10)).join(',')+'#'+boxes.length;
    // 1) OCR 命中「外部招募」文字 → 直接点（每屏都查，无需等到到底）。
    //    FORCE_FALLBACK=true（测试包）时跳过 OCR 命中，强制走视觉识别，专测视觉链路。
    const ocrHit=!FORCE_FALLBACK && boxes.find(b=>/外部招募/.test((b.texts||[]).join('')));
    if(ocrHit){
      await v.click({detail:{best:{box:ocrHit.box}}},'进入外部招募(OCR命中)');
      try{
        await v.wait(marker,'进入外部招募页确认',{timeout:8000});
        setFallbackTriggered(false);return true;
      }catch(_){
        console.log('外部招募定位：OCR命中但未进入外部招募页，回主界面重进');
        await v.homeReturn().catch(()=>{});
        if(await v.home())await v.step(()=>v.homeButton('recruit'),async()=>!await v.home(),'重新打开招募界面');
        prevSig=null;
        if(++misfire>3){setFallbackTriggered(true);throw new Error('外部招募定位失败：OCR多次命中却未进入外部招募页，已返回主界面');}
        continue;
      }
    }
    // 2) 已滑到底（指纹不变）且 OCR 未命中 → 从下往上视觉识别兜底
    if(boxes.length && sig===prevSig){
      if(DEBUG_SIDEBAR_EFFECT)await saveSidebarEffect(v,boxes,{round:i,atBottom:true});
      const visual=await visualDetectExternal(v);
      if(visual){
        if(DEBUG_SIDEBAR_EFFECT)await saveVisualEffect(v,visual,boxes,{round:i});
        await v.click({detail:{best:{box:visual.box}}},'进入外部招募(视觉识别)');
        try{
          await v.wait(marker,'进入外部招募页确认',{timeout:8000});
          setFallbackTriggered(false);return true;
        }catch(_){
          console.log('外部招募定位：视觉识别点击后未进入外部招募页');
        }
      }
      // OCR 与视觉都失败 → 回主界面重进招募（列表重置顶部），下一轮重新收敛
      await v.homeReturn().catch(()=>{});
      if(await v.home())await v.step(()=>v.homeButton('recruit'),async()=>!await v.home(),'重新打开招募界面');
      prevSig=null;
      if(++misfire>3){setFallbackTriggered(true);throw new Error('外部招募定位失败：OCR与视觉识别均未进入外部招募页，已返回主界面');}
      continue;
    }
    prevSig=sig;
    if(!boxes.length)console.log('外部招募定位：本屏未识别到侧栏池子框，继续滑动');
    // 未到底：保持招募列表根，向下滑动累积滚动，让外部招募上移进可视区
    await v.swipe(130,590,130,220,600,'招募列表下滑');
    await pause(700);v.s.check();
  }
  // 滑动超限仍未成功：OCR 完全失效时再视觉识别兜底一次
  const visual=await visualDetectExternal(v);
  if(visual){
    if(DEBUG_SIDEBAR_EFFECT)await saveVisualEffect(v,visual,[],{round:'超限兜底'});
    await v.click({detail:{best:{box:visual.box}}},'进入外部招募(视觉识别·超限兜底)');
    try{
      await v.wait(marker,'进入外部招募页确认',{timeout:8000});
      setFallbackTriggered(false);return true;
    }catch(_){}
  }
  setFallbackTriggered(true);
  await v.homeReturn().catch(()=>{});
  throw new Error('外部招募定位失败：滑动次数超限，已返回主界面，未点击任何付费操作');
}
async function occupiedSlots(v){
  // 主检测：槽位状态（招募中/空闲）在招募位竖排编号栏（中央偏左 x≈280-340），
  // 按“招募中”出现次数统计占用槽位。与左栏“N/4”徽标、侧栏滚动无关，最稳。
  try{
    const reco=await v.ocr('.*',[260,160,110,340]);
    const all=(reco&&reco.detail&&reco.detail.all)||[];
    const texts=all.map(e=>e&&e.text);
    const occupied=texts.filter(t=>t==='招募中').length;
    const idle=texts.filter(t=>t==='空闲').length;
    // 仅当确实识别到槽位状态（招募中/空闲）时才采信，避免整次读空误判为 0。
    if(reco&&reco.detail&&(occupied+idle)>=1&&occupied>=0&&occupied<=4)return occupied;
  }catch(_){}
  // 兜底：左栏“N/4”徽标（放宽到左边缘、标签上下的竖带，避免被屏幕左缘切掉）。
  const label=await externalLabel(v);
  const box=label?.detail?.best?.box;
  if(box){
    const top=Math.max(0,box[1]-90);
    const reco=await v.ocr('^[0-4][/／]4$',[0,top,200,150]);
    const m=reco?.detail?.best?.text?.match(/^([0-4])[/／]4$/);
    if(m)return Number(m[1]);
  }
  return null;
}
module.exports={SIDEBAR,externalLabel,enterExternal,occupiedSlots,externalPage,FORCE_FALLBACK,poolBoxes,visualDetectExternal,saveVisualEffect};
