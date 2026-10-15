from pathlib import Path
import json,zipfile,hashlib,shutil
BASE=Path(__file__).resolve().parent.parent
SRC=BASE/'心锚终端'
DEST=BASE/'发布'/'心锚终端-0.1.0'
DEST.mkdir(parents=True,exist_ok=True)
exclude={'数据','日志','__pycache__'}
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in exclude for x in rel.parts) or p.name in ['test_engine.py','smoke_ui.py','package_release.py','OCR实测.json']:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
readme='''心锚终端 0.1.0 — 桌面识别与评分试用版

使用方法
1. 将整个文件夹解压到普通可写目录，双击“心锚终端.exe”。不要单独移动 EXE。
2. “表格”文件夹已附带本次提供的 Excel。程序首次启动自动生成数据库。
3. 推荐图鉴可以查看40名探员的推荐、重要加粗词条和红字不可替代特性。
4. 打开“截图识别与评分”，点击两个示例按钮即可试用，或导入自己的游戏截图。
5. 选择探员和分数阈值。识别后可修正字段，勾选“已核对”，点击“重新评分”。
6. 可导出含截图来源、字段、分数和判定理由的 JSON 记录。

更新数据
将新版 xlsx 放入“表格”文件夹，点击“读取 / 更新数据库”。多个文件时明确选择。
程序按内容哈希及导入器版本刷新 SQLite，不修改 Excel。导入失败保留上次有效数据库。

当前实现
Windows桌面窗口、独立EXE入口、附带Python/Node运行库及本地OCR模型，无需安装开发环境。
表格导入、推荐数据库与图鉴、截图OCR、重要词条前两档校验、多版本数值候选、评分与人工核对。

当前限制
这是第一阶段试用版：不会移动鼠标，不会锁定、标记放弃或分解心锚。
“建议锁定/建议放弃”仅为评分预览。评分权重与默认80分阈值为试用参数。
首版按示例布局读取接近16:9的完整游戏详情截图；窗口边框、黑边或其他布局需先裁切。
金色四角星尚未自动识别，界面中默认为“未知”，需要时可人工确认。
min! 低生命偏好、规则未覆盖、数值版本歧义和低置信识别进入待复核。
未推荐不等于没有价值。当前尚未实现三件心锚组合优化及配队场景选择。

验证结果
18项规则测试通过。两张提供的真实详情截图，其名称、等级、四条词条与数值、两个特性核对通过。
已测试界面控件构建、数据填充、探员筛选、人工修正、阈值变化。
桌面检查工具启动授权等待超时，尚未完成可见窗口的人工视觉检查，也未在另一台电脑测试。
两张截图不构成准确率统计；其他截图可能进入待复核。

文件说明
“数据”与“日志”会在运行时生成。OCR仅在本地运行，不上传截图。
程序由桌面EXE启动，运行界面由随包Python组件提供；运行时看到pythonw进程是正常现象。
遇到启动或识别错误，请查看“日志”目录。
第三方运行库许可见“第三方许可”及各运行库目录内的LICENSE/许可证文件。
'''
(DEST/'使用说明.txt').write_text(readme,encoding='utf-8-sig')
results={'version':'0.1.0','unit_tests':{'passed':18,'failed':0},'ocr_real_screenshots':{'count':2,'names_levels_stats_values_traits':'passed','star_recognition':'not implemented'},'ui_internal_callbacks':'passed','visible_ui_review':'not completed: app launch approval timed out','game_operations':'not implemented; disabled by scope','other_pc':'not tested'}
(DEST/'验证结果.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
archive=BASE/'发布'/'心锚终端-0.1.0.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(digest+'  '+archive.name,encoding='utf-8')
print(json.dumps({'exe':str(DEST/'心锚终端.exe'),'zip':str(archive),'zip_bytes':archive.stat().st_size,'sha256':digest},ensure_ascii=False))
