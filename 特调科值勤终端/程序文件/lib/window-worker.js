const {spawn}=require('child_process');
const readline=require('readline'),path=require('path');
class WindowWorker {
 constructor({command='powershell.exe',args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'../temporary_fullscreen.ps1'),'-Mode','serve'],timeout=30000}={}){this.command=command;this.args=args;this.timeout=timeout;this.seq=0;}
 start(){
  if(this.child)return;
  const child=this.child=spawn(this.command,this.args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.errors='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stderr.on('data',s=>{this.errors=(this.errors+s).slice(-4000);});
  child.stdin.on('error',e=>this.fail(e));child.on('error',e=>this.fail(e));
  this.lines=readline.createInterface({input:child.stdout});
  this.lines.on('line',line=>{
   let r;try{r=JSON.parse(line.replace(/^\uFEFF/,''));}catch{return;}
   const p=this.pending;if(!p||r.id!==p.id)return;
   clearTimeout(p.timer);this.pending=null;
   if(r.ok)p.resolve(r.output||'');else {p.reject(new Error(r.error||'全屏辅助失败'));this.close();}
  });
  child.on('exit',()=>{if(this.child===child)this.fail(new Error(this.errors||'全屏辅助进程已退出'));});
 }
 request(mode,point={}){
  if(this.pending)return Promise.reject(new Error('全屏辅助请求正在执行，禁止重叠操作'));
  this.start();const id=++this.seq;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.fail(new Error('全屏辅助等待超时')),this.timeout);
   this.pending={id,resolve,reject,timer};
   this.child.stdin.write(JSON.stringify({id,mode,...point})+'\n');
  });
 }
 fail(error){const p=this.pending;this.pending=null;if(p){clearTimeout(p.timer);p.reject(error);}this.close();}
 close(){
  if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(new Error('全屏辅助已停止'));}
  const c=this.child;this.child=null;if(this.lines){this.lines.close();this.lines=null;}if(c)c.kill();
 }
}
module.exports={WindowWorker};
