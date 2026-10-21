// 跨任务共享的结束提醒：任务可登记一条面向用户的提示，
// 由 run_selected_tasks 在整轮结束时统一写进摘要日志并缀在终态状态行上。
const notices=[];
function addNotice(text){
 if(!text)return;
 const line=String(text).split(/\r?\n/)[0].trim();
 if(line&&!notices.includes(line))notices.push(line);
}
function takeNotices(){return notices.splice(0,notices.length);}
module.exports={addNotice,takeNotices};
