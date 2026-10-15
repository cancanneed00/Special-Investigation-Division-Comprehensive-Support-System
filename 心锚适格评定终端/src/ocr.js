// Offline image recognition only. No Controller or input APIs are instantiated.
const fs=require('fs'),path=require('path');
const root=__dirname;
const maa=require(path.join(root,'node_modules/@maaxyz/maa-node'));
async function main(){
 maa.Global.config_init_option(path.join(root,'../日志/OCR'));
 maa.Global.stdout_level='Error';maa.Global.save_draw=false;maa.Global.save_on_error=false;
 const r=new maa.Resource();r.inference_execution_provider='CPU';r.inference_device='CPU';
 const t=new maa.Tasker();
 try {
  if(!(await r.post_bundle(path.join(root,'resource')).wait()).succeeded)throw Error('OCR 模型加载失败');
  t.resource=r;
  async function recognize(input,output){
  const b=fs.readFileSync(input),image=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  const outputs=[];
  for(const roi of [[300,55,238,280],[85,385,445,105]]){
   const job=await t.post_recognition('OCR',{expected:'.*',roi,order_by:'Vertical'},image).wait();
   const result=await job.get();
   const reco=result?.nodes?.length?t.node_detail(result.nodes[0])?.reco:null;
   outputs.push({roi,detail:reco?.detail||null});
  }
  if(fs.existsSync(input+'.zoom.png')){
   const z=fs.readFileSync(input+'.zoom.png');
   const job=await t.post_recognition('OCR',{expected:'.*',roi:[0,0,200,400],order_by:'Vertical'},z.buffer.slice(z.byteOffset,z.byteOffset+z.byteLength)).wait();
   const result=await job.get();const reco=result?.nodes?.length?t.node_detail(result.nodes[0])?.reco:null;
   outputs.push({zoom:true,detail:reco?.detail||null});
  }
  if(fs.existsSync(input+'.rows.png')){
   const z=fs.readFileSync(input+'.rows.png');
   const job=await t.post_recognition('OCR',{expected:'.*',roi:[0,0,780,720],order_by:'Vertical'},z.buffer.slice(z.byteOffset,z.byteOffset+z.byteLength)).wait();
   const result=await job.get();const reco=result?.nodes?.length?t.node_detail(result.nodes[0])?.reco:null;
   outputs.push({rows_zoom:true,detail:reco?.detail||null});
  }
  fs.writeFileSync(output,JSON.stringify(outputs,null,2),'utf8');
  }
  if(process.argv[2]==='--server'){
   const rl=require('readline').createInterface({input:process.stdin,crlfDelay:Infinity});
   for await(const line of rl){
    let q;
    try{q=JSON.parse(line);await recognize(q.input,q.output);process.stdout.write(JSON.stringify({id:q.id,ok:true})+'\n');}
    catch(e){process.stdout.write(JSON.stringify({id:q?.id,ok:false,error:e.message})+'\n');}
   }
  }else{await recognize(...process.argv.slice(2));}
 }finally{t.destroy();r.destroy();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
