"""Build a local portable release. Never modifies external installations."""
from pathlib import Path
import shutil,zipfile,json,hashlib
from engine import VERSION
BASE=Path(__file__).resolve().parent.parent;ROOT=BASE/'心锚终端';DEST=BASE/'发布'/('心锚适格评定终端-'+VERSION)
notes='''心锚适格评定终端 0.6.4
工作目录：D:\\Codex\\异象回声工具。后续构建使用build.py，发布使用package_local.py；不更新F盘。
图标：使用透明多尺寸ICO、版本化图标资源和程序入口，避免沿用旧路径缓存。建议运行心锚适格评定终端-0.6.4.exe。
翻页：修复选中白框遮住底边时遗漏最后一列的问题；本轮175件失败截图已验证为2行重叠。
续扫：扫描页和历史页新增“断点 / 手动续扫”。每件完成后保存断点，关闭程序后仍可载入。
自动续扫：保持最后完成项选中，校验详情、选中框、排序和仓库数量后，从下一件继续，不返回顶部。
手动续扫：在游戏中选中第一件未处理心锚，并使它完整可见，点击“从当前选中项开始”。该件也会处理。
续扫保留此前结果并连续编号；历史载入和离线重评会合并整条续扫链。即使起点校验失败也不会清空此前记录。
本轮“结果摘要.csv”包含续扫前后全部记录，历史图片沿用原文件，不重复复制。旧版已分段的记录也可直接合并查看。
沿用上轮操作模式和规则；旧版本未记录探员范围时，界面明确使用当前探员选择。
断点截图随7天/300MB规则清理。截图缺失或位置不明时，自动续扫会拒绝并提示手动校正。
实际翻页失败截图、续扫边界和防止重扫测试通过；尚未重新跑完全部仓库。
规则界面：保留 / 放弃 / 模拟与说明三个页签，每个条件附操作符、参考值和边界说明，固定底部保存。
模拟器：6个示例，可修改分数、数量、档位与类型；调用实际判定函数，不操作游戏。
双评分和一、二星跳过逻辑保持不变。
'''
(ROOT/('更新说明-'+VERSION+'.txt')).write_text(notes,encoding='utf-8-sig')
(ROOT/'验证结果.json').write_text(json.dumps({'version':VERSION,'policy_simulator_tests':5,'combined_history_tests':6,'related_history_resume_tests':17,'live_full_inventory_verified':False},ensure_ascii=False,indent=2),encoding='utf-8')
for p in ROOT.rglob('*'):
 rel=p.relative_to(ROOT)
 if not p.is_file() or any(x in {'数据','日志','__pycache__','示例截图'} for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in {'package_release.py','OCR实测.json'}:continue
 if p.parent==ROOT and p.suffix.lower()=='.exe' and not p.name.startswith('心锚适格评定终端'):continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
archive=BASE/'发布'/('心锚适格评定终端-'+VERSION+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest)
print(json.dumps({'exe':str(ROOT/('心锚适格评定终端-'+VERSION+'.exe')),'archive':str(archive),'sha256':digest},ensure_ascii=False))
