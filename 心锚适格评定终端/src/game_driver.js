// Strict, bounded game adapter. No key input, arbitrary click or dismantle action exists.
const fs=require('fs'),path=require('path'),readline=require('readline');
const ROOT=__dirname,maa=require(path.join(ROOT,'node_modules/@maaxyz/maa-node'));
const GUARD=require('./input_guard');
let controller,resource,tasker,stopped=false;
const stopFile=process.argv[2];
function check(){if(stopped||fs.existsSync(stopFile))throw Error('已停止');}
async function connect(){
 if(controller)return;
 maa.Global.config_init_option(path.join(ROOT,'../日志/Game'));
 maa.Global.stdout_level='Error';maa.Global.save_draw=false;maa.Global.save_on_error=false;
 const matches=(await maa.Win32Controller.find()).filter(x=>x[1]==='UnityWndClass'&&x[2]==='异象回声');
 if(matches.length!==1)throw Error('请只打开一个异象回声PC客户端，并进入心锚仓库');
 controller=new maa.Win32Controller(matches[0][0],maa.Win32ScreencapMethod.Background,maa.Win32InputMethod.Seize,maa.Win32InputMethod.PostMessage);
 if(!(await controller.post_connection().wait()).succeeded)throw Error('游戏连接失败，请核对窗口权限');
 controller.screenshot_target_long_side=1280;
 resource=new maa.Resource();resource.inference_execution_provider='CPU';resource.inference_device='CPU';
 if(!(await resource.post_bundle(path.join(ROOT,'resource')).wait()).succeeded)throw Error('识别资源加载失败');
 tasker=new maa.Tasker();tasker.controller=controller;tasker.resource=resource;
}
async function capture(){
 check();const b=Buffer.from(await controller.post_screencap().wait().get()||[]);
 if(b.length<24||Math.abs(b.readUInt32BE(16)-1280)>2||Math.abs(b.readUInt32BE(20)-720)>2)throw Error('游戏截图尺寸异常，请使用16:9窗口');
 return b;
}
async function reco(type,params,b){
 const j=await tasker.post_recognition(type,params,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)).wait();
 const r=await j.get();return r?.nodes?.length?tasker.node_detail(r.nodes[0])?.reco:null;
}
async function scene(b){
 const top=await reco('OCR',{roi:[568,23,510,60],expected:'.*'},b);
 const texts=(top?.detail?.all||[]).map(x=>x.text).join(' ');
 const foot=await reco('OCR',{roi:[565,649,165,43],expected:'仓库'},b);
 if(!texts.includes('等级')||!texts.includes('星级')||!foot?.hit)throw Error('未确认仓库界面，停止输入');
}
async function handle(q){
 check();GUARD.validate(q);await connect();check();
 const b=await capture();check();
 if(q.op==='capture'){fs.writeFileSync(q.output,b);return {captured:true};}
 // Read-only stabilization screenshots need no OCR. Every input still verifies the scene.
 await scene(b);check();
 // Verify the scored detail and the card grid against the immediately preceding frame.
 if(q.guard){
  for(const [index,template] of q.guard.entries()){
   check();const data=fs.readFileSync(path.join(ROOT,'resource/image',template.name));
   const name='live-guard-'+index+'.png';resource.override_image(name,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
   const r=await reco('TemplateMatch',{template:name,roi:template.roi,threshold:.985},b);
   if(!r?.hit)throw Error('画面已变化，取消输入');
  }
 }else throw Error('缺少操作前画面校验');
 check();
 if(q.op==='sort_level'){
  const [x,y]=GUARD.point(q);check();if(!(await controller.post_click(x,y).wait()).succeeded)throw Error('等级排序失败');
 }else if(q.op==='select'){
  const [x,y]=GUARD.point(q);check();if(!(await controller.post_click(x,y).wait()).succeeded)throw Error('选择心锚失败');
 }else if(q.op==='mark'){
  const [x,y]=GUARD.point(q);check();if(!(await controller.post_click(x,y).wait()).succeeded)throw Error('标记请求失败');
 }else if(q.op==='scroll'){
  const up=q.direction==='up';
  // Seize moves the pointer; never reposition the game window to simulate input.
  // Hold the pointer at the endpoint before release, suppressing Unity inertia.
  const distance=q.precise?130:260,start=up?250:510,end=start+(up?distance:-distance);
  check();const job=await tasker.post_action('Swipe',{begin:[1100,start,1,1],end:[1100,end,1,1],duration:q.precise?1200:1000,end_hold:400},[0,0,0,0]).wait();
  if(!job.succeeded)throw Error('翻页拖动失败');
 }
 return {sent:true};
}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
async function main(){
 for await(const line of rl){
  let q;try{q=JSON.parse(line);const result=await handle(q);process.stdout.write(JSON.stringify({id:q.id,ok:true,result})+'\n');}
  catch(e){process.stdout.write(JSON.stringify({id:q?.id,ok:false,error:e.message})+'\n');}
 }
}
main().finally(()=>{stopped=true;tasker?.destroy();resource?.destroy();controller?.destroy();});
