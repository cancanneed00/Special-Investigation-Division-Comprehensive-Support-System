// Test the actual native image override API without a controller or game inputs.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../心锚终端/程序文件');
const maa=require(path.join(root,'node_modules/@maaxyz/maa-node'));
const buf=fs.readFileSync(path.join(__dirname,'verification/guard-frame.png'));
const image=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
(async()=>{
 maa.Global.config_init_option(path.join(root,'../日志/OfflineGuard'));maa.Global.stdout_level='Error';
 const r=new maa.Resource(),t=new maa.Tasker();
 try{
  assert((await r.post_bundle(path.join(root,'resource')).wait()).succeeded);t.resource=r;
  for(let i=0;i<3;i++){
   const template=fs.readFileSync(path.join(__dirname,'verification/guard-crop.png'));
   r.override_image('live-guard-0.png',template.buffer.slice(template.byteOffset,template.byteOffset+template.byteLength));
   const job=await t.post_recognition('TemplateMatch',{template:'live-guard-0.png',roi:[298,58,242,279],threshold:.985},image).wait();
   const result=await job.get();assert(t.node_detail(result.nodes[0]).reco.hit);
  }
 }finally{t.destroy();r.destroy();}
 console.log('Native dynamic guard reuse passed; no game inputs.');
})().catch(e=>{console.error(e);process.exitCode=1;});
