const fs=require('fs'),path=require('path');
const {Flow}=require('./lib/flow');
const {OfficeFlow}=require('./lib/office-flow');
async function run(session){
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'事务所配置.json'),'utf8').replace(/^\uFEFF/,''));
 const first=config['第一优先']||'星砂',second=config['第二优先']||'金钱';
 if(!['金钱','经验','星砂','材料'].includes(first)||!['金钱','经验','星砂','材料'].includes(second)||first===second)throw new Error('事务所优先级无效');
 const v=new Flow(session);await new OfficeFlow(v,first,second).run();
 await v.capture(path.join(__dirname,'运行结果_事务所解读.png'));
}
module.exports={run};
