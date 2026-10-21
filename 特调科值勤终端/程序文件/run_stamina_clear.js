const path=require('path');
const {Flow}=require('./lib/flow');
const {sweepCorridor,readVinylCap}=require('./lib/corridor');
const {addNotice}=require('./lib/run-notices');
async function run(session){
 const v=new Flow(session);
 console.log('清体力固定目标：红币');
 await v.step(()=>v.homeButton('combat'),()=>v.ocr('.*限禁区.*'),'进入作战');
 await v.textStep('.*限禁区.*',()=>v.ocr('^(会客间|会客厅|废弃枢纽)$'),'进入阈限禁区');
 const corridor=()=>v.ocr('.*回廊.*区.*',[600,80,680,490]);
 if(!await corridor()){
  await v.wait(()=>v.ocr('^废弃枢纽$'),'确认禁区列表');
  if(!await corridor()){console.log('当天无回廊，返回主页');await v.homeReturn();return;}
 }
 await v.step(corridor,()=>v.ocr('^扫荡$',[850,570,300,150]),'进入回廊');
 // 黑胶上限未满时不刷红币：先刷黑胶更划算。退出清体力流程，整轮结束时提醒用户优先刷黑胶。
 const vinyl=await readVinylCap(v);
 if(vinyl!==null&&vinyl<480){
  console.log(`黑胶上限 ${vinyl}/480 未满，跳过红币刷取`);
  addNotice(`黑胶上限 ${vinyl}/480 未满，本轮已跳过红币扫荡；黑胶有获取上限、先刷满更划算，请在回廊刷黑胶至 480/480 后重跑清体力`);
  await v.homeReturn();
  return;
 }
 await sweepCorridor(v);
 await v.homeReturn();
 await v.capture(path.join(__dirname,'运行结果_清体力.png'));
}
module.exports={run};
