const {HOME_TEMPLATES}=require('./flow');
// Navigation only: no claiming, purchasing, recruiting or dismantling.
async function verifyInput(v) {
  let entered = false;
  try {
    await v.wait(() => v.home(), '输入测试起点主页', {timeout:10000});
    await v.act(() => v.homeButton('shop'), () => v.shop(),
    '后台点击补给站并进入商店', {attempts:3, timeout:5000});
    entered = true;
    await v.act(() => v.template(HOME_TEMPLATES, [0,0,500,150], 0.74),
      () => v.home(), '后台点击 Home 并返回主页', {attempts:3, timeout:5000});
    console.log('后台输入验证通过：商店页面与主页双向切换均已确认');
  } catch (cause) {
    const error = new Error(entered
      ? `已确认进入商店，输入有效；返回主页校验失败：${cause.message}。若正在使用主题皮肤，其返回主页图标可能未被收录：请把该皮肤下左上角“返回主页”图标截图放入 程序文件/resource/base/image，并在 lib/flow.js 的 HOME_TEMPLATES 中追加文件名。`
      : `后台输入验证未完成，未执行任务：${cause.message}。请确认已停留在游戏主界面（大厅：可见 招募 / 补给站 / 事务所 / 探员 等入口），而不是登录页、加载页或任何二级页面；然后查看失败截图与识别耗时。`);
    error.code = entered ? 'HOME_RETURN_UNVERIFIED' : 'BACKGROUND_INPUT_UNVERIFIED';
    throw error;
  }
}
module.exports = { verifyInput };
