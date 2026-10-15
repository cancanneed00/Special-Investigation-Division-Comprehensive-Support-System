// Both result layouts occur in one sweep sequence. Use ordinary text in
// separate regions when the decorative title is covered by the character.
async function corridorResult(v) {
  return v.frame(async()=>{
    if(await v.ocr('^探索完成$',[0,0,850,250]))return true;
    return Boolean(await v.ocr('^完成关卡$',[20,210,180,70]) &&
      await v.ocr('^获得星数$',[20,535,180,65]) &&
      await v.ocr('.*得分.*',[560,560,260,90]));
  });
}
module.exports={corridorResult};
