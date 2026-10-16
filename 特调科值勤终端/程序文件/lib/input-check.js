// Navigation only: no claiming, purchasing, recruiting or dismantling.
async function verifyInput(v) {
  let entered = false;
  try {
    await v.wait(() => v.home(), '输入测试起点主页', {timeout:10000});
    await v.act(() => v.homeButton('shop'), () => v.shop(),
    '后台点击补给站并进入商店', {attempts:3, timeout:5000});
    entered = true;
    await v.act(() => v.template('主界面按钮.png', [0,0,500,150], 0.74),
      () => v.home(), '后台点击 Home 并返回主页', {attempts:3, timeout:5000});
    console.log('后台输入验证通过：商店页面与主页双向切换均已确认');
  } catch (cause) {
    const error = new Error(entered
      ? `已确认进入商店，输入有效；返回主页校验失败：${cause.message}。请查看失败截图中的返回按钮。`
      : `后台输入验证未完成，未执行任务：${cause.message}。未能稳定确认商店页面；这不等于点击无效，请查看失败截图与识别耗时。`);
    error.code = entered ? 'HOME_RETURN_UNVERIFIED' : 'BACKGROUND_INPUT_UNVERIFIED';
    throw error;
  }
}
module.exports = { verifyInput };
