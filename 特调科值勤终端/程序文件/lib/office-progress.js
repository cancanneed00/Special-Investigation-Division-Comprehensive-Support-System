const {sleep}=require('./vision');
async function finishCard(office,{pause=sleep,now=Date.now,timeout=30000}={}){
 const v=office.v;let blanks=0;
 try {
  await v.wait(async()=>{
   if(await v.loading())return false;
   if(await v.reward()){await v.rewardClick();return false;}
   if(await office.archive())return !!(await office.firstCard()||await office.empty());
   // Never repeat the spending action while the candidate page is still visible.
   if(await office.candidatePage())return false;
   if(blanks>=20)throw new Error('解读过场关闭达到保护上限，尚未返回解读仪式页');
   await v.blank('关闭解读过场',async()=>!await office.archive()&&!await office.candidatePage());
   blanks++;return false;
  },'返回解读仪式页',{timeout,stable:2,pause,now});
  console.log('已返回解读仪式页，继续检查卡片');
 }catch(cause){
  if(cause.code!=='RESULT_TIMEOUT')throw cause;
  const error=new Error(`未确认返回解读仪式页；不重复开始仪式：${cause.message}`,{cause});
  error.code=cause.code;throw error;
 }
}
module.exports={finishCard};
