from pathlib import Path
import json,zipfile,hashlib,shutil
from ui_v4 import HELP
BASE=Path(__file__).resolve().parent.parent;SRC=BASE/'心锚终端';DEST=BASE/'发布/心锚终端-0.4.0'
DEST.mkdir(parents=True,exist_ok=True)
exclude={'数据','日志','__pycache__','示例截图'}
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in exclude for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in ['package_release.py','OCR实测.json']:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
readme='心锚终端 0.4.0\n\n完整解压后运行心锚终端.exe，不要单独移动EXE。无需安装Python或Node。\n\n'+'\n\n'.join(title+'\n'+body for title,body in HELP)+'\n\n验证与限制\n80项规则、导入、图像、历史和模拟扫描测试通过，224件旧记录离线重算。\n本轮未执行游戏锁定或放弃标记，尚未验证完整仓库结束和实际标记图标联调。程序绝不点击解离。\n'
summary=json.loads((BASE/'src/verification/v4-summary.json').read_text(encoding='utf-8'))
summary.update(full_warehouse_completion_verified=False,live_marking_verified=False)
for folder in [DEST,SRC]:
 (folder/'使用说明.txt').write_text(readme,encoding='utf-8-sig')
 (folder/'验证结果.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
archive=BASE/'发布/心锚终端-0.4.0.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest+'  '+archive.name,encoding='utf-8')
print(json.dumps({'exe':str(DEST/'心锚终端.exe'),'zip':str(archive),'bytes':archive.stat().st_size,'sha256':digest},ensure_ascii=False))
