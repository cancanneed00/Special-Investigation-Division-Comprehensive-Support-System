const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function decompositionConfirmed(before, quantity, after, remaining) {
  // Background production may refill the warehouse after the reward closes.
  // Require a net reduction AND evidence that the selected stack decreased.
  return Number.isInteger(after) && after >= before-quantity && after < before &&
    Number.isInteger(remaining) && remaining >= 0 && remaining < quantity;
}

function parseCapacity(reco) {
  const text = reco?.detail?.best?.text || '';
  const m = text.replace(/\s/g,'').match(/(?:仓库|库存)(\d+)[/／](\d+)/);
  return m ? Number(m[1]) : null;
}
function parseQuantity(reco) {
  const m = (reco?.detail?.best?.text || '').match(/数量\s*[:：]?\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
class OfficeInventory {
  constructor(vision) { this.v = vision; }
  capacity() { return this.v.ocr('(仓库|库存).*[/／].*', [700,0,230,60]); }
  async count() { return parseCapacity(await this.capacity()); }
  async warehouse() {
    return !await this.v.reward() && !await this.v.ocr('^分解数量$', [150,170,980,200]) &&
      await this.capacity() && await this.v.ocr('^取消$', [600,580,680,140]);
  }
  async remaining(name, total) {
    if(total===0)return await this.v.ocr('^暂无物品$',[650,180,530,400]) ? 0 : null;
    const reco=await this.v.ocr('.*',[760,75,290,535]);
    const rows=(reco?.detail?.all || []).filter(row=>
      /^(勇气|守护|机运|生命)护符|^库存/.test(row.text)).sort((a,b)=>a.box[1]-b.box[1]);
    const items=[];
    for(let i=0;i<rows.length;i++) {
      if(!/^(勇气|守护|机运|生命)护符/.test(rows[i].text))continue;
      const next=rows[i+1];
      const m=next?.text.replace(/\s/g,'').match(/^库存[:：]?(\d+)$/);
      if(!m)return null;
      items.push({name:rows[i].text,count:Number(m[1])});
    }
    // An absent name is not zero unless every item is accounted for.
    if(!items.length || items.reduce((sum,item)=>sum+item.count,0)!==total)return null;
    return items.filter(item=>item.name===name).reduce((sum,item)=>sum+item.count,0);
  }
  async confirmDecomposition(before, quantity, name) {
    return this.v.wait(async()=>{
      const after=await this.count();
      if(after===null || after>=before || after<before-quantity)return false;
      return decompositionConfirmed(before,quantity,after,await this.remaining(name,after));
    },'分解后库存与目标材料减少（允许后台补入）');
  }
  async run() {
    const v = this.v;
    await v.act(() => v.ocr('^库存$', [0,450,1280,270]), () => this.warehouse(), '进入事务所库存', {attempts:3, timeout:5000});
    await v.act(() => v.ocr('^全部$', [1050,50,230,220]), () => this.warehouse(), '库存全部分类');
    for (let round=0; round<64; round++) {
      await v.wait(() => this.warehouse(), '库存页面稳定');
      const before = await this.count();
      if (before === null) throw new Error('无法读取库存总数，不能判定材料是否分解完成');
      if (before === 0) {
        await v.wait(async () => await this.count() === 0 && await this.warehouse() && await v.ocr('^暂无物品$', [650,180,530,400]), '确认库存为零');
        await v.act(() => v.ocr('^取消$', [600,580,680,140]),
          async () => !await this.capacity() && await v.ocr('^库存$', [0,450,1280,270]), '退出库存', {attempts:3, timeout:5000});
        return;
      }
      // Locate the first visible material by its actual name; never click a stored slot coordinate.
      const first = await v.wait(() => v.ocr('(勇气|守护|机运|生命)护符.*', [650,80,500,530]), '第一种材料', {stable:1});
      const name = first.detail.best.text;
      const kind = name.match(/(勇气|守护|机运|生命)护符/)?.[0];
      if (!kind) throw new Error('不是已授权分解的四类材料');
      await v.act(() => v.ocr('^'+escapePattern(name)+'$', [650,80,500,530]),
        () => v.ocr('^'+escapePattern(name)+'$', [180,80,420,240]), `选择${name}并确认详情`, {attempts:3, timeout:5000});
      await v.act(() => v.ocr('^分解$', [650,580,630,140]),
        () => v.ocr('^分解数量$', [150,170,980,200]), '分解材料', {attempts:3, timeout:5000});
      await v.act(() => v.ocr('^MAX$', [650,250,500,200]), async () => {
        const selected = parseQuantity(await v.ocr('数量.*[0-9]+', [400,240,450,120]));
        const max = Number((await v.ocr('^[0-9]+$', [780,290,100,110]))?.detail?.best?.text);
        return selected > 0 && selected === max;
      }, 'MAX 最大数量已生效', {attempts:3, timeout:5000});
      const quantity = parseQuantity(await v.ocr('数量.*[0-9]+', [400,240,450,120]));
      // Read again immediately before the irreversible confirmation.
      const numbers = await v.ocr('^[0-9]+$', [780,290,100,110]);
      const maximum = Number(numbers?.detail?.best?.text);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity !== maximum || quantity > before)
        throw new Error(`MAX 校验失败：数量 ${quantity}，最大值 ${maximum}，库存 ${before}`);
      await v.act(() => v.ocr('^确定$', [600,390,450,140]), () => v.reward(), `确认分解${quantity}个${name}`);
      await v.dismissReward(() => this.warehouse());
      await this.confirmDecomposition(before,quantity,name);
      console.log(`分解完成：${name} × ${quantity}，已确认库存减少，继续检查实时库存`);
    }
    throw new Error('分解超过 64 轮保护上限');
  }
}
module.exports = { OfficeInventory, parseCapacity, parseQuantity, decompositionConfirmed };
