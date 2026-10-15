async function adjustCount(read,click,target,{maxSteps=200}={}) {
 if(!Number.isInteger(target)||target<0||target>maxSteps)throw new Error('目标次数无效');
 for(let step=0;step<maxSteps;step++){
  const current=await read();
  if(!Number.isInteger(current)||current<0)throw new Error('当前次数无法确认');
  if(current===target)return current;
  const direction=current<target?1:-1;
  let changed=false;
  for(let attempt=0;attempt<3;attempt++){
   const fresh=await read();
   if(fresh!==current){if(fresh===current+direction){changed=true;break;}throw new Error('次数意外变化，停止调整');}
   await click(direction);
   const after=await read();
   if(after===current+direction){changed=true;break;}
   if(after!==current)throw new Error('加减后次数变化不是1，停止调整');
  }
  if(changed)continue;
  // 加三次不变：已到可选上限（如快速完成每日上限 < 调令数），按当前值收尾属正常
  if(direction>0)return current;
  throw new Error('减三次后仍未生效');
 }
 throw new Error('次数调整超过保护上限');
}
module.exports={adjustCount};
