const fs=require('fs');
function importantLine(text){
 const first=String(text).split(/\r?\n/)[0];
 if(!/^(开始：|完成并验证：|任务失败：|两个优先类型均缺货|缺货退出已确认)/.test(first))return null;
 return first.replace('完成并验证：','完成：').replace(/ Error: /,' · ').slice(0,240);
}
function appendSummary(file,text){
 const lines=fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\n').filter(Boolean):[];
 lines.push(`[${new Date().toLocaleTimeString('zh-CN',{hour12:false})}] ${String(text).split(/\r?\n/)[0].slice(0,240)}`);
 fs.writeFileSync(file,lines.slice(-100).join('\n')+'\n');
}
module.exports={importantLine,appendSummary};
