const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const calls=[],out=[],recognitions=[],overrides=[];let bundles=0;const png=Buffer.alloc(24);png.writeUInt32BE(1280,16);png.writeUInt32BE(720,20);
class Job{constructor(result){this.result=result;this.succeeded=true;}wait(){return this;}get(){return this.result;}}
class Controller{static async find(){return [[1,'UnityWndClass','异象回声']];}post_connection(){return new Job();}post_screencap(){return new Job(png);}destroy(){}}
class Resource{post_bundle(){bundles++;return new Job();}override_image(name){overrides.push(name);}destroy(){}}
class Tasker{
 post_recognition(type,params){recognitions.push(type);this.reco={hit:true,detail:{all:[{text:'等级 星级 仓库'}]}};return new Job({nodes:[1]});}
 node_detail(){return {reco:this.reco};}
 post_action(type,params,box){calls.push({type,params,box});return new Job();}
 destroy(){}
}
const queries=[{id:1,op:'scroll',direction:'down',guard:[{name:'guard.png',roi:[0,0,1,1]}]},{id:2,op:'scroll',direction:'up',precise:true,guard:[{name:'guard.png',roi:[0,0,1,1]}]}];
queries.push({id:3,op:'capture',output:'frame.png'},{id:4,op:'capture',output:'frame2.png'});
const maa={Global:{config_init_option(){}},Win32Controller:Controller,Resource,Tasker,Win32ScreencapMethod:{Background:1},Win32InputMethod:{Seize:1,PostMessage:2}};
const context={Buffer,console,__dirname:__dirname,process:{argv:['node','driver','stop'],stdin:{},stdout:{write(x){out.push(JSON.parse(x));}}},require(name){
 if(name==='fs')return {existsSync(){return false;},readFileSync(){return png;},writeFileSync(){}};
 if(name==='path')return path;
 if(name==='readline')return {createInterface(){return {async *[Symbol.asyncIterator](){for(const q of queries)yield JSON.stringify(q);}};}};
 if(name==='./input_guard')return require('./input_guard');
 return maa;
}};
(async()=>{
 await vm.runInNewContext(fs.readFileSync(path.join(__dirname,'game_driver.js'),'utf8'),context);
 assert(out.every(x=>x.ok),JSON.stringify(out));assert.equal(out.length,4);assert.equal(calls.length,2);
 assert.equal(bundles,1);assert.deepEqual(overrides,['live-guard-0.png','live-guard-0.png']);
 assert.deepEqual(recognitions,['OCR','OCR','TemplateMatch','OCR','OCR','TemplateMatch']);
 assert.equal(calls[0].type,'Swipe');assert.deepEqual(Array.from(calls[0].params.begin),[1100,510,1,1]);assert.deepEqual(Array.from(calls[0].params.end),[1100,250,1,1]);
 assert.equal(calls[0].params.end_hold,400);assert.equal(calls[0].params.duration,1000);
 assert.deepEqual(Array.from(calls[1].params.end),[1100,380,1,1]);assert.equal(calls[1].params.duration,1200);
 console.log('Held swipe protocol: normal/precise endpoints and dwell passed; no game inputs.');
})().catch(e=>{console.error(e);process.exitCode=1;});
