const fs=require('fs'),path=require('path');
class Diagnostics {
 constructor(root,{intervalMs=2000,now=Date.now,io=fs}={}){this.dir=path.join(root,'日志记录','诊断');this.intervalMs=intervalMs;this.now=now;this.io=io;this.last=-Infinity;}
 save(state,label){
  const now=this.now();if(!label && now-this.last<this.intervalMs)return false;
  this.last=now;
  try{
   this.io.mkdirSync(this.dir,{recursive:true});
   const data={at:new Date(now).toISOString(),label,samplingIntervalMs:this.intervalMs,pending:state.pendingRecognition,history:state.diagnosticHistory};
   const json=JSON.stringify(data,null,2);
   // Metadata and image describe the same sampled recognition input. Failures
   // bypass throttling; native hangs retain the last sample and supervisor label.
   if(state.lastImage && !this.image?.equals(state.lastImage)){
    this.io.writeFileSync(path.join(this.dir,'最近识别截图.png'),state.lastImage);this.image=state.lastImage;
   }
   this.io.writeFileSync(path.join(this.dir,'最近识别.json'),json);
   if(label){
    this.io.writeFileSync(path.join(this.dir,'最近失败.json'),json);
    if(state.lastImage)this.io.writeFileSync(path.join(this.dir,'最近失败截图.png'),state.lastImage);
   }
   return true;
  }catch(error){console.log('诊断记录写入失败：'+error.message);return false;}
 }
}
module.exports={Diagnostics};
