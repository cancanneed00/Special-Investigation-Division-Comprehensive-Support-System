const path=require('path');
const {Flow}=require('./lib/flow');
const {sweepCorridor}=require('./lib/corridor');
async function run(session){
 const v=new Flow(session);
 console.log('清体力固定目标：红币');
 await v.textStep('^作战$',()=>v.ocr('.*限禁区.*'),'进入作战');
 await v.textStep('.*限禁区.*',()=>v.ocr('^(会客间|会客厅|废弃枢纽)$'),'进入阈限禁区');
 const corridor=()=>v.ocr('.*回廊.*区.*',[600,80,680,490]);
 if(!await corridor()){
  await v.wait(()=>v.ocr('^废弃枢纽$'),'确认禁区列表');
  if(!await corridor()){console.log('当天无回廊，返回主页');await v.homeReturn();return;}
 }
 await v.step(corridor,()=>v.ocr('^扫荡$',[850,570,300,150]),'进入回廊');
 await sweepCorridor(v);
 await v.homeReturn();
 await v.capture(path.join(__dirname,'运行结果_清体力.png'));
}
module.exports={run};
