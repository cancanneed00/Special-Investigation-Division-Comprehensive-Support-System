const { Session, ROOT }=require('./lib/session');
const { Vision }=require('./lib/vision');
const path=require('path');
async function main(){
 const s=new Session();
 try { await s.connect();const v=new Vision(s);await v.capture(path.join(ROOT,'启动检查_当前画面.png'));await v.wait(()=>v.home(),'主界面');console.log('后台截图和主页识别正常；此检查不证明后台点击被游戏接受。'); }
 finally {await s.close();}
}
if(require.main===module)main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(2);});
module.exports={main};
