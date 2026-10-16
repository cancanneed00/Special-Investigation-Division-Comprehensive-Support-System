const normalize=text=>String(text||'').replace(/\s/g,'');
const patterns={recruit:/^招募$/,shop:/^补给站$/,office:/^事务所$/,agent:/^探员$/,anchor:/^心锚$/,combat:/^(作战|combat)$/i,progress:/^当前进度$/,tasks:/^.?任务$/,system:/^系统$/};
function menuFromRows(rows){
  const menu={};
  for(const [key,pattern] of Object.entries(patterns)){
    const hits=rows.filter(row=>pattern.test(normalize(row.text)) &&
      (row.score===undefined || row.score>=0.7));
    // Ambiguous labels must not select an arbitrary box.
    menu[key]=hits.length===1?hits[0]:null;
  }
  const overlay=rows.some(row=>/获取物资|是否离开|分解数量/.test(normalize(row.text)));
  menu.confirmed=!overlay && !!(menu.recruit&&menu.shop&&menu.office&&(menu.agent||menu.anchor));
  return menu;
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
module.exports={homeMenu,homeButton,menuFromRows};
