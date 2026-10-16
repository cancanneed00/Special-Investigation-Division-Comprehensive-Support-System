const {WindowWorker}=require('./window-worker');
const {sleep}=require('./flow');
const worker=new WindowWorker();
process.once('exit',()=>worker.close());
async function changeWindow(mode,point,options){
 try{const output=await worker.request(mode,point,options);if(output.trim())console.log(output.trim());}
 finally{if(mode==='restore')worker.close();}
}
function clickPoint(button,size){
 const b=button?.detail?.best?.box;
 if(!b||b.length!==4||!size||size.length!==2||[...b,...size].some(n=>!Number.isFinite(n)))throw new Error('全屏叉号识别框无效');
 const [x,y,w,h]=b,[width,height]=size;
 if(w<=0||h<=0||x<0||y<0||x+w>width||y+h>height)throw new Error('全屏叉号识别框越界');
 return {X:Math.floor(x+w/2),Y:Math.floor(y+h/2),ImageWidth:width,ImageHeight:height};
}
const CLOSE_TEMPLATES=['流程_好友关闭.png','任务_好友互助关闭.png',...[90,110,120,130].map(n=>`好友叉号_${n}.png`)];
async function closeFriend(v,change=changeWindow,{pause=sleep}={}){
 const changeChecked=(mode,point)=>{
  const timeout=mode==='enter'?90000:Math.min(90000,30000*(v.slowScale||1));
  return v.s.operation('好友窗口 '+mode,()=>change(mode,point,{timeout,check:()=>v.s.check()}),timeout+5000);
 };
 const title=()=>v.ocr('^好友互助$',[0,30,650,200]);
 await v.wait(title,'确认好友互助弹层稳定出现',{timeout:10000});
 try{
  v.s.friendFullscreen=true;
  await changeChecked('enter');
  const closed=async()=>{
   await v.capture();const [w,h]=v.size;
   return !await title()&&await v.ocr('^好友互助$',[Math.round(w*.65),Math.round(h*.75),Math.floor(w*.35),Math.floor(h*.25)]);
  };
  for(let attempt=1;attempt<=3;attempt++){
   await changeChecked('check');
   console.log(`好友叉号：全屏内第 ${attempt}/3 次识别与关闭`);
   try{
    if(await closed()){await v.wait(closed,'好友弹层已关闭',{timeout:4000});break;}
    const button=await v.wait(async()=>{
     await v.capture();const [w,h]=v.size;
     return await title()&&await v.template(CLOSE_TEMPLATES,[Math.round(w*.78),0,Math.floor(w*.22),Math.round(h*.3)],0.72);
    },'全屏叉号',{timeout:4000,stable:1});
    await changeChecked('check');
    v.s.check();
    await changeChecked('click',clickPoint(button,v.size));
    console.log('全屏原生点击好友叉号：'+JSON.stringify(button.detail.best.box));
    await v.wait(closed,'全屏下确认好友互助关闭',{timeout:4000});
    break;
   }catch(error){
    v.s.check();
    if(error.code!=='RESULT_TIMEOUT'||attempt===3)throw error;
    console.log('好友互助仍未关闭，保持全屏后重新识别，不恢复窗口');
   }
  }
  await changeChecked('restore');
  v.s.friendFullscreen=false;
  await v.wait(()=>v.ocr('^好友互助$',[900,580,380,140]),'恢复窗口后市区巡逻');
 }catch(cause){
  worker.close();
  const error=new Error(`好友互助关闭未完成，已停止；不会退回窗口模式点击叉号。${cause.message}`);
  error.code='FRIEND_FULLSCREEN_CLOSE_FAILED';
  throw error;
 }
}
module.exports={closeFriend,changeWindow,CLOSE_TEMPLATES,clickPoint};
