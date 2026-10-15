from pathlib import Path
import json,zipfile,hashlib,shutil
from ui_v4 import HELP
BASE=Path(__file__).resolve().parent.parent;SRC=BASE/'心锚终端';DEST=BASE/'发布/心锚终端-0.5.0'
DEST.mkdir(parents=True,exist_ok=True)
exclude={'数据','日志','__pycache__','示例截图'}
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in exclude for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in ['package_release.py','OCR实测.json']:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
summary=json.loads((BASE/'src/verification/v5-summary.json').read_text(encoding='utf-8'))
summary.update(real_30_screenshot={'anchor':'指挥官棋子','value':98.18,'match':77.78},full_warehouse_completion_verified=False,live_marking_verified=False)
readme='心锚终端 0.5.0\n\n完整解压后运行心锚终端.exe，不要单独移动EXE。\n原生Windows程序；无需安装Python或Node。\n\n本次更新\n识别页取消整页及多层滚动，操作栏固定；历史依据精简，双击查看完整解释。\n支持单件1级与30级原表评分，仓库仅处理1级。\n新增可调联合放弃阈值和参考值恢复，评分公式可在程序内查看。\n程序与窗口图标使用用户提供的紫发章鱼少女素材。\n\n'+'\n\n'.join(title+'\n'+body for title,body in HELP)+'\n\n验证\n89项测试通过，224件历史样本重算：保留78、放弃51、跳过69、复核26。保留集合与原规则一致。\n实图验证30级指挥官棋子：数值98.18，匹配77.78。\n验证期间未向游戏发送锁定或放弃指令。本版未重新实测整仓结束及实际标记操作。\n'
for folder in [DEST,SRC]:
 (folder/'使用说明.txt').write_text(readme,encoding='utf-8-sig')
 (folder/'验证结果.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
archive=BASE/'发布/心锚终端-0.5.0.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest+'  '+archive.name,encoding='utf-8')
print(json.dumps({'exe':str(DEST/'心锚终端.exe'),'zip':str(archive),'bytes':archive.stat().st_size,'sha256':digest},ensure_ascii=False))
