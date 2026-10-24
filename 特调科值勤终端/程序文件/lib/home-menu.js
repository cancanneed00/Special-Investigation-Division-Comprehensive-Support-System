const normalize=text=>String(text||'').replace(/\s/g,'');
// 主题皮肤会把英文副标题与中文标签连成一行（如“招募RECRUIT”“补给站SUPPLIES”），
// 因此允许中文标签后跟随非中文装饰；但前后绝不允许再出现其它汉字，
// 否则会把招募子页的“常驻招募 / 外部招募 / 招募一次”误判成主页菜单。
const CN='\\u4e00-\\u9fff';
const label=core=>new RegExp(`^${core}[^${CN}]*$`);
// 艺术字皮肤下单个标签的 OCR 置信度会偏低，阈值由 0.7 放宽到 0.6；
// 主页判定已改为“独立信号数”门槛，个别低分噪声不足以单独放行。
const MIN_SCORE=0.6;
const patterns={recruit:label('招募'),shop:label('补给站'),office:label('事务所'),agent:label('探员'),anchor:label('心锚'),combat:new RegExp(`^(作战|combat)[^${CN}]*$`,'i'),progress:label('当前进度'),tasks:new RegExp(`^.?任务[^${CN}]*$`),system:label('系统')};
const SIGNAL_LABELS={recruit:'招募',shop:'补给站',office:'事务所',roster:'探员/心锚',combat:'作战/当前进度'};
const SIGNAL_MIN=3;
function menuFromRows(rows){
  const menu={};
  for(const [key,pattern] of Object.entries(patterns)){
    const hits=rows.filter(row=>pattern.test(normalize(row.text)) &&
      (row.score===undefined || row.score>=MIN_SCORE));
    // Ambiguous labels must not select an arbitrary box.
    menu[key]=hits.length===1?hits[0]:null;
  }
  const overlay=rows.some(row=>/获取物资|是否离开|分解数量/.test(normalize(row.text)));
  // 按“独立信号数”判定，而不是要求每个标签都命中：艺术字皮肤下个别标签可能读不出。
  // 招募子页最多只有“招募 + 当前进度”两类信号，达不到阈值，不会被误判为主页。
  const signals=[];
  if(menu.recruit)signals.push('recruit');
  if(menu.shop)signals.push('shop');
  if(menu.office)signals.push('office');
  if(menu.agent||menu.anchor)signals.push('roster');
  if(menu.combat||menu.progress)signals.push('combat');
  menu.signals=signals;
  menu.confirmed=!overlay && signals.length>=SIGNAL_MIN;
  return menu;
}
// 主页判定失败时给出可读原因，便于确认当前停留在哪个页面。
function menuSummary(menu){
  const signals=menu?.signals||[];
  return {found:signals.map(key=>SIGNAL_LABELS[key]),
    missing:Object.keys(SIGNAL_LABELS).filter(key=>!signals.includes(key)).map(key=>SIGNAL_LABELS[key])};
}
async function homeMenu(v){
  const [width,height]=v.size||[1280,720];
  const reco=await v.ocr('.*',[0,0,width,height]);
  return menuFromRows(reco?.detail?.all||[]);
}
async function homeButton(v,key){
  if(!Object.hasOwn(patterns,key))throw new Error('未知主页菜单：'+key);
  return v.frame(async()=>{
    const menu=await homeMenu(v);
    if(!menu.confirmed || await v.reward())return null;
    // 当前进度 is text within the Combat card in all supplied skins, including
    // the cursive English skin. Use its OCR box, never an offset or fixed slot.
    const row=menu[key] || (key==='combat'?menu.progress:null);
    if(!row?.box)return null;
    return {hit:true,detail:{best:row,all:[row],filtered:[row]}};
  });
}
module.exports={homeMenu,homeButton,menuFromRows,menuSummary};
