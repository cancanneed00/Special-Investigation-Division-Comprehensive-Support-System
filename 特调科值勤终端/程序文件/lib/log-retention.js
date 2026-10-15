const fs=require('fs'),path=require('path');
// Only generated diagnostics under this directory; never follow links or touch resources/config.
function cleanupLogs(root,{maxBytes=100*1024*1024,maxAgeDays=14,now=Date.now()}={}){
 const dir=path.join(root,'日志记录'),files=[];
 function walk(folder){
  if(!fs.existsSync(folder)||fs.lstatSync(folder).isSymbolicLink())return;
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
   const p=path.join(folder,entry.name);if(entry.isSymbolicLink())continue;
   if(entry.isDirectory())walk(p);
   else if(entry.isFile()&&/\.(log|png|jpg|jpeg|bmp)$/i.test(entry.name)){const s=fs.statSync(p);files.push({p,size:s.size,time:s.mtimeMs});}
  }
 }
 walk(dir);files.sort((a,b)=>b.time-a.time);let kept=0,removed=0;
 for(const f of files){
  if(now-f.time>maxAgeDays*86400000||kept+f.size>maxBytes){try{fs.unlinkSync(f.p);removed++;}catch{kept+=f.size;}}
  else kept+=f.size;
 }
 return {removed,bytes:kept};
}
module.exports={cleanupLogs};
