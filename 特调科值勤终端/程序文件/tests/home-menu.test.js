const {test}=require('node:test');const assert=require('node:assert/strict');const {Vision}=require('../lib/vision');const {menuFromRows}=require('../lib/home-menu');
function fixture(combat='作战'){
 const points=[];let rows=['招募','补给站','事务所','探员',combat,'任务','系统'].map((text,i)=>({text,score:0.99,box:[40+i*130,100+i*40,80,30]}));
 const v=new Vision({check(){},operation:async(label,fn)=>fn(),controller:{post_click(x,y){points.push([x,y]);return {wait:async()=>({succeeded:true})};}}});v.size=[1280,720];v.ocr=async()=>({detail:{all:rows}});v.reward=async()=>false;
 return {v,points,get rows(){return rows;},set rows(value){rows=value;}};
}
test('home recognition does not require fixed combat text or menu coordinates',async()=>{
 const f=fixture('当前进度');assert.equal(await f.v.home(),true);assert.equal((await f.v.homeButton('combat')).detail.best.text,'当前进度');
 f.rows=f.rows.map(row=>({...row,box:[row.box[0]+80,row.box[1]+60,80,30]}));assert.equal(await f.v.home(),true);
});
test('click point follows current OCR text box after layout changes',async()=>{
 const f=fixture();await f.v.click(await f.v.homeButton('shop'),'shop');assert.deepEqual(f.points[0],[210,155]);
 f.rows=f.rows.map(row=>row.text==='补给站'?{...row,box:[950,550,100,40]}:row);
 await f.v.click(await f.v.homeButton('shop'),'shop');assert.deepEqual(f.points[1],[1000,570]);
});
test('combat accepts English and prefers explicit label over progress',async()=>{
 const f=fixture('Combat');f.rows.push({text:'当前进度',box:[700,400,80,20],score:1});assert.equal((await f.v.homeButton('combat')).detail.best.text,'Combat');
});
test('unknown page with progress text cannot authorize combat click',async()=>{
 const f=fixture();f.rows=[{text:'当前进度',box:[400,400,80,20],score:1},{text:'作战',box:[100,100,80,20],score:1}];assert.equal(await f.v.home(),false);assert.equal(await f.v.homeButton('combat'),null);
});
test('reward overlay blocks menu buttons even when background words remain visible',async()=>{
 const f=fixture();f.v.reward=async()=>true;assert.equal(await f.v.home(),false);assert.equal(await f.v.homeButton('shop'),null);
 f.v.reward=async()=>false;f.rows.push({text:'获取物资'});assert.equal(await f.v.home(),false);
});
test('duplicate or low-confidence menu text is not clicked',async()=>{
 const f=fixture();f.rows.push({...f.rows[1],box:[800,200,80,30]});assert.equal(await f.v.homeButton('shop'),null);
 f.rows.pop();f.rows[1].score=.2;assert.equal(await f.v.homeButton('shop'),null);
});
test('normalization handles spaced labels but rejects other recruitment pages',()=>{
 const rows=['招 募','补 给 站','事务所','心锚'].map(text=>({text,score:1}));assert.equal(menuFromRows(rows).confirmed,true);
 assert.equal(menuFromRows([{text:'常驻招募'},{text:'外部招募'},{text:'招募一次'},{text:'当前进度'}]).confirmed,false);
});
