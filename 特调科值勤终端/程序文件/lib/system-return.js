async function systemPage(v){
 return await v.ocr('.*危机行动调令.*',[0,280,500,250]) || await v.ocr('^(设置|公告|公告签)$',[0,550,330,170]);
}
async function returnFromSystem(v){
 if(await v.home())return;
 await v.wait(async()=>await v.home()||await systemPage(v),'系统页或主页',{timeout:15000});
 if(await v.home())return;
 await v.act(()=>v.template('商店_左上返回箭头.png',[0,0,250,130],0.74),()=>v.home(),'系统页返回主页',{attempts:3,timeout:4000});
}
module.exports={systemPage,returnFromSystem};
