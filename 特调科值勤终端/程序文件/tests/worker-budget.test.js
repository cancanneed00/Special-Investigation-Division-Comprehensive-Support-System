const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');const {WindowWorker}=require('../lib/window-worker');const {supervise}=require('../lib/supervisor');
test('window helper accepts complete response without breaking persistent protocol',async()=>{
 const code="require('readline').createInterface({input:process.stdin}).on('line',line=>{let r=JSON.parse(line);console.log(JSON.stringify({id:r.id,ok:true,output:r.mode}));});";
 const w=new WindowWorker({command:process.execPath,args:['-e',code],timeout:1000});try{assert.equal(await w.request('enter'),'enter');assert.equal(await w.request('restore'),'restore');}finally{w.close();}
});
test('window helper honors cancellation during pending request',async()=>{
 const w=new WindowWorker({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],timeout:5000});const start=Date.now();try{await assert.rejects(w.request('enter',{}, {check:()=>{if(Date.now()-start>200)throw Error('user stop');}}),/user stop/);assert.equal(w.child,null);}finally{w.close();}
});
test('window helper timeout is bounded and rejects before another request overlaps',async()=>{
 const w=new WindowWorker({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],timeout:200});try{const request=w.request('enter');await assert.rejects(w.request('restore'),/禁止重叠/);await assert.rejects(request,/超时/);assert.equal(w.child,null);}finally{w.close();}
});
test('supervisor enforces total task budget even when operation heartbeat keeps resetting',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echoes-task-budget-'));try{const entry=path.join(dir,'worker.js');fs.writeFileSync(entry,"process.send({kind:'task-deadline',deadline:Date.now()-16000});setInterval(()=>process.send({kind:'operation-end'}),50);");assert.equal(await supervise(entry,dir,{args:[],initialTimeout:5000}),2);assert.match(JSON.parse(fs.readFileSync(path.join(dir,'运行_UI状态.json'))).current,/任务超过安全时限/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
