'use strict';
const fs=require('fs'),path=require('path');
// 全部可用灵感池（从游戏内截图整理，供 UI 下拉选择）。如需增删，与 sea-page.ps1 中的 $inspPool 保持同步。
const INSPIRATION_POOL=['心灵迷雾','维持战线','身心调和','神秘陌客','坚定信念','环境遮蔽','雾中脚步','视线扭曲','能量涌流','抵抗侵蚀','象位研究','区域强袭','战前准备','应急护盾','护盾冲击','坚定意志','火力覆盖','战术支撑'];
const DEFAULT_INSPIRATIONS=['能量涌流','火力覆盖','战前准备','身心调和','环境遮蔽'];
// 灵感选择顺序由「海域灵感配置.json」的 selected 决定；文件缺失/非法时回退默认。
function loadInspirations(){
  try{
    const p=path.join(__dirname,'..','海域灵感配置.json');
    if(fs.existsSync(p)){
      const cfg=JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
      if(Array.isArray(cfg.selected)&&cfg.selected.length>=1){
        const list=cfg.selected.filter(n=>typeof n==='string'&&n.length>0);
        if(list.length>=1)return list;
      }
    }
  }catch(_){}
  return DEFAULT_INSPIRATIONS.slice();
}
const INSPIRATIONS=loadInspirations();
const clean=s=>String(s||'').replace(/\s/g,'');
function number(text){const s=clean(text);return /^\d+$/.test(s)?Number(s):null;}
function fraction(text){const m=clean(text).match(/^(\d+)[/／](\d+)$/);return m&&Number(m[2])===1000&&Number(m[1])<=1000?Number(m[1]):null;}
// Counts are located by their xN badges, never by the changing skill icon.
function skillBadges(rows){return rows.filter(r=>r.box&&r.box[0]>=880&&r.box[1]>=490&&r.box[1]<=550&&/^[xX×]\d+$/.test(clean(r.text))&&r.score>=0.75).map(r=>({x:Math.round(r.box[0]+r.box[2]/2),y:Math.round(r.box[1]+r.box[3]/2)-38,count:Number(clean(r.text).slice(1))})).sort((a,b)=>a.x-b.x);}
// 最终战斗逐回合释放灵感：每个我方回合释放一次。
// pending 表示「本回合已点、但技能尚未被消耗」；由 battle 每帧调用 clearIfConsumed 解除，
// 解除条件为「对应技能次数下降」或「兜底超时 10s」，避免 OCR 漏读次数时永久卡死整场战斗。
// 注意：解除只在 battle 循环里每帧执行，不再依赖「画面完全稳定」这个容易不满足的前置门槛。
class SkillTracker{
 constructor(){this.nextIndex=0;this.pending=null;this.pendingSince=0;}
 pick(badges){
  if(!badges||!badges.length)return null;
  for(let i=0;i<badges.length;i++){const idx=(this.nextIndex+i)%badges.length,b=badges[idx];if(b.count>0){this.nextIndex=(idx+1)%badges.length;return b;}}
  return null;
 }
 clearIfConsumed(badges){
  if(!this.pending)return;
  const b=badges&&badges.find(b=>Math.abs(b.x-this.pending.x)<30);
  if((b&&b.count<this.pending.count)||Date.now()-this.pendingSince>10000)this.pending=null;
 }
}
class SeaEngine{
 constructor(port){this.p=port;this.round=0;this.battle=0;this.stage=0;}
 async run(){
  await this.p.enter();
  let first=true;
  for(;;){
   this.p.check();
   const shards=await this.p.shards();
   if(shards>=1000){if(!first||await this.p.ask('full','意识碎片已达 1000/1000。继续将使用自由探索；是否继续？')!=='continue'){await this.p.home();return;}}
   first=false;this.round++;this.battle=0;this.stage=0;
   await this.p.dive(shards>=1000);   // 满 1000 → 自由探索（点左侧卡片）；不足 → 深潜指引（点右侧「使用深潜指引」）
   for(;;){const remaining=await this.p.formation();if(remaining===0)break;const action=await this.p.ask('formation',remaining===null?'无法可靠读取编队剩余人数，请检查后复检。':`编队还缺 ${remaining} 人，请补齐后复检。`);if(action==='exit'){await this.p.home();return;}}
   await this.p.enterNodes();
   const total=(INSPIRATIONS.length-1)*2+1;
   for(let i=0;i<INSPIRATIONS.length;i++){
    this.stage=i+1;this.p.progress(this,total);
    await this.p.inspiration(INSPIRATIONS[i]);
    for(let j=0;j<(i===INSPIRATIONS.length-1?1:2);j++){
     this.battle++;this.p.progress(this,total);
     await this.p.temporary();
     await this.p.deploy();
     await this.p.battle(this.battle===9);
     await this.p.settlement(this.battle===9);
    }
   }
   await this.p.finish();
  }
 }
}
module.exports={SeaEngine,SkillTracker,skillBadges,INSPIRATION_POOL,INSPIRATIONS,number,fraction,clean};
