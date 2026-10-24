const {test}=require('node:test');const assert=require('node:assert/strict');
const {homeStartFailure}=require('../run_selected_tasks');
const {menuFromRows,menuSummary}=require('../lib/home-menu');

test('startup failure tells the operator to start from the home screen',()=>{
 const error=homeStartFailure('当前画面未识别到任何主界面菜单项。');
 assert.match(error.message,/未在游戏主界面，无法开始运行/);
 assert.match(error.message,/先让游戏停留在主界面/);
 assert.match(error.message,/不要停留在登录页、加载页或任何二级页面/);
 assert.equal(error.code,'HOME_NOT_CONFIRMED');
});

test('startup failure names what was recognised and what is missing',()=>{
 // 停在招募子页：只有“招募 + 当前进度”两类信号，提示里必须说清还缺什么，
 // 否则用户只知道“失败”，不知道自己停在哪一页。
 const rows=[{text:'招募',score:0.99,box:[1100,500,90,40]},{text:'当前进度',score:0.95,box:[1100,560,120,40]}];
 const summary=menuSummary(menuFromRows(rows));
 assert.deepEqual(menuFromRows(rows).confirmed,false,'招募子页不得被判为主页');
 const error=homeStartFailure(`当前画面识别到 ${summary.found.join('、')}，缺少 ${summary.missing.join('、')}。`);
 assert.match(error.message,/识别到 招募、作战\/当前进度/);
 assert.match(error.message,/缺少 补给站、事务所、探员\/心锚/);
});

test('startup failure keeps the underlying timeout as the cause',()=>{
 const cause=new Error('等待超时');
 const error=homeStartFailure('当前画面未识别到任何主界面菜单项。',cause);
 assert.equal(error.cause,cause);
});
