// Offline native tests, no Controller constructed.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../心锚终端/程序文件');
const maa=require(path.join(root,'node_modules/@maaxyz/maa-node'));
async function main(){
 maa.Global.config_init_option(path.join(root,'../日志/NativeTest'));maa.Global.stdout_level='Error';
 const r=new maa.Resource(),t=new maa.Tasker();r.inference_execution_provider='CPU';r.inference_device='CPU';
 const file=path.join(root,'resource/image/test-dynamic.png');
 try{
  assert((await r.post_bundle(path.join(root,'resource')).wait()).succeeded);t.resource=r;
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(__dirname,'reference/native-crop.png'),file);
  assert((await r.post_bundle(path.join(root,'resource')).wait()).succeeded);
  const b=fs.readFileSync(path.join(__dirname,'reference/native-frame.png'));const image=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  async function reco(type,p){const j=await t.post_recognition(type,p,image).wait();const x=await j.get();return x?.nodes?.length?t.node_detail(x.nodes[0])?.reco:null;}
  const top=await reco('OCR',{roi:[568,23,510,60],expected:'.*'});const texts=top.detail.all.map(x=>x.text).join(' ');
  assert(texts.includes('等级')&&texts.includes('星级'),texts);
  assert((await reco('OCR',{roi:[565,649,165,43],expected:'仓库'})).hit);
  const match=await reco('TemplateMatch',{template:'test-dynamic.png',roi:[568,86,634,561],threshold:.985});assert(match?.hit,JSON.stringify(match));
  assert(!(await reco('TemplateMatch',{template:'test-dynamic.png',roi:[0,0,634,561],threshold:.985})).hit);
  console.log(JSON.stringify({sceneOCR:'passed',dynamicTemplate:'passed',wrongFrameRejected:'passed',gameInputs:0}));
 }finally{fs.rmSync(file,{force:true});t.destroy();r.destroy();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
