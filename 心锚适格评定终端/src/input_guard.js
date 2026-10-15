// Only these destinations can ever reach the game's input API.
const COLS=[633,755,877,999,1121];
function validate(q){
 if(!q||!['capture','select','mark','scroll','sort_level'].includes(q.op))throw Error('禁止的操作');
 if(q.op==='select'&&(!Number.isInteger(q.col)||q.col<0||q.col>4||!Number.isInteger(q.y)||q.y<140||q.y>600))throw Error('仓库格子超出白名单');
 if(q.op==='scroll'&&q.direction!==undefined&&!['up','down'].includes(q.direction))throw Error('滚动方向无效');
 if(q.op==='scroll'&&q.precise!==undefined&&typeof q.precise!=='boolean')throw Error('滚动模式无效');
 if(q.op==='mark'&&!['lock','discard'].includes(q.kind))throw Error('只允许锁定或标记放弃');
 if(q.op!=='capture'&&(!Array.isArray(q.guard)||q.guard.length<1))throw Error('缺少画面保护');
}
function point(q){
 validate(q);let p=q.op==='sort_level'?[650,52]:q.op==='select'?[COLS[q.col],q.y]:q.op==='mark'?(q.kind==='lock'?[73,144]:[50,203]):null;
 if(!p||p[0]>=1000&&p[1]>=640)throw Error('禁止输入区域');
 return p;
}
module.exports={validate,point};
