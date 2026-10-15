from pathlib import Path
import json,zipfile,hashlib,shutil
BASE=Path(__file__).resolve().parent.parent
SRC=BASE/'心锚终端';DEST=BASE/'发布/心锚终端-0.2.3'
DEST.mkdir(parents=True,exist_ok=True)
exclude={'数据','日志','__pycache__'}
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in exclude for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in ['package_release.py','OCR实测.json']:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
readme='''心锚终端 0.2.3 — 自动识别、双评分、连续翻页试用版

启动：完整解压后双击“心锚终端.exe”，不要单独移动EXE。无需安装Python或Node。
表格：将xlsx放入同目录“表格”文件夹，启动自动生成数据库。更新表格后点击“读取 / 更新数据库”。多个表格可指定读取哪一个。

自动识别
在“自动识别与双评分”中导入16:9完整游戏截图，或点击“识别游戏当前心锚”。
自动读取名称、等级、属性、数值、金星和特性，不需要手工选择属性和特性。
单件预览仅检查当前选中一件；批量扫描在“本轮全部结果”保留每件结果。可以先点击示例一/示例二，查看40名探员的逐项匹配结果。

双评分
数值分：实际存在词条的（当前数值/对应版本、位置、属性的满值）平均×100。
例如三条全满=100分，四条全满=100分。词条数另行显示；确认缺少的3、4号位不进入分母。
无法识别不能视为缺少。满档显示舍入按原表容差处理，无法确定版本时显示分数区间。
数值分不要求精确命中某一档：在表内数值范围内，按当前值/满值计算，另行注明档位未确定。第四词条按原表说明：存在即满档。超出范围或缺少规则仍需复核。
游戏里的负易伤对应原表正免伤，例如“全部易伤 -3%”对应“全部免伤 3%”；“受到治疗”对应“受治疗”。保留原始识别文本，不对任意负数取绝对值。
批量结果增加“原因 / 评分依据”列，选中一行可查看详情。数值分可用不代表所有OCR都已可靠；特性不确定的条目仍跳过标记。
可在“本轮全部结果”点击“载入上轮记录并重新评分”，直接复核已保存的截图，不操作游戏。
匹配分：独立比较该探员推荐的心锚、属性种类和特性，不受词条数值高低影响。
红字权重5、加粗3、普通1，特性权重乘0.5；优先级 > 每步减0.2，≥ 每步减0.1，= 不减。
同探员多条推荐取较好匹配。没有推荐此心锚的探员显示0分。
这些权重是程序的可解释评分约定，不是原表作者提供的官方分数；备注和min!原文保留在图鉴。

规则与操作
在“保留与放弃规则”页，分别为锁定和放弃设置数值分、最高探员匹配分。
每项分数可独立启用，两项同时启用时可选“任一满足”或“同时满足”。
默认锁定：数值分≥95或最高匹配分≥80；默认放弃：数值分<90且最高匹配分<60。
默认阈值仅为试用起点，请按自己的需求设置。两组规则冲突时保留优先，未命中任何规则则跳过。
游戏中先打开心锚仓库，保持16:9及默认网格，设置需要的筛选列表，再点击“扫描全部并按规则标记”。
主入口提供“扫描全部心锚（只评分）”和“扫描全部并按规则标记”。扫描前自动确认等级排序；高等级在前时点击等级按钮一次，已经是低等级在前时保持。随后自动回顶部、逐件扫描、连续拖动翻页。拖动采用执勤终端危机行动的输入方式，等待惯性滚动停止，再核对重叠行避免重复。重叠行不能唯一识别时停止。要覆盖整个仓库，请先在游戏中清除筛选。
仅处理1级心锚。已有锁定保持原状态；冲突或不明确的已有标记跳过。
只使用左侧锁定、左侧标记放弃，以及列表选中/滚动。没有解离操作入口，绝不点击右下角“解离”。
F8或“停止”终止后续输入。操作前核对画面、操作后核对标记；状态不能确认时停止，绝不重复切换。
识别不确定时跳过复核；结果导出和每轮记录位于“数据”目录。

验证与限制
48项规则/图像/排序/惯性等待/模拟标记测试通过；此前两个原始截图的名称、等级、4个词条、特性和金星识别通过。
输入白名单2305个格子位置、禁止操作拒绝测试通过。离线仓库识别、动态模板匹配与错误画面拒绝通过。
桌面控件构建、5个页签、只读字段、探员筛选、规则切换回调通过。
此前真实游戏扫描数量、跨页数和停止原因见“验证结果.json”。已验证从高等级在前自动切换为1级在前，连续跨页、逐件识别和双评分。0.2.3改用鼠标直接输入，移除了移动窗口的兼容输入方式，新输入方式实测状态见验证结果。未执行锁定或放弃标记；未在其他电脑测试。
锁定/放弃标记后的图标颜色仍需实际游戏联调；不匹配时程序会停止。未覆盖的数值、识别冲突会显示“跳过复核”，不会猜测后标记。
两张参考截图不代表其他布局的准确率。当前不做三件套组合优化，不处理强化后的数值。
OCR全部在本地运行，不上传截图；日志保存在“日志”和“数据/整理记录”。
程序入口为EXE，内部运行pythonw进程属于正常现象。第三方许可见“第三方许可”和各运行库目录。
'''
(DEST/'使用说明.txt').write_text(readme,encoding='utf-8-sig')
run=SRC/'数据/整理记录/16a5f63672124025852ed0b2f3af7db1'
summary=json.loads((run/'summary.json').read_text(encoding='utf-8'))
rows=json.loads((run/'results.json').read_text(encoding='utf-8'))
replay=json.loads((BASE/'src/verification/replay-summary.json').read_text(encoding='utf-8'))
live=SRC/'数据/整理记录/4c378df461b84cdbacb29ca13ebc039f'
live_summary=json.loads((live/'summary.json').read_text(encoding='utf-8'))
live_rows=json.loads((live/'results.json').read_text(encoding='utf-8'))
results={'version':'0.2.3','unit_tests':48,'ocr_samples_previously_verified':2,'input_whitelist':'passed','previous_live_game':summary,'previous_live_pages':len({r['page'] for r in rows}),'level_sort_high_to_low':'passed (previous run 02e99c2ab83f4a80a9746c66b6cf377c)','new_mouse_backend':'Seize; live validation pending','offline_replay':replay,'game_mark_inputs_during_validation':0,'full_warehouse_completion_verified':False}
results.update(new_mouse_backend='Seize; live cross-page dry scan passed',new_live_game=live_summary,new_live_pages=len({r['page'] for r in live_rows}),window_bounds_before_and_after={'originX':763,'originY':407,'width':856,'height':511})
(DEST/'验证结果.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
archive=BASE/'发布/心锚终端-0.2.3.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest+'  '+archive.name,encoding='utf-8')
print(json.dumps({'exe':str(DEST/'心锚终端.exe'),'zip':str(archive),'bytes':archive.stat().st_size,'sha256':digest},ensure_ascii=False))
