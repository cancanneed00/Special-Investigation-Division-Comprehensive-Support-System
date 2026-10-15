from pathlib import Path
import shutil,zipfile,json,datetime,hashlib
BASE=Path(__file__).resolve().parent.parent;SRC=BASE/'心锚终端';DEST=BASE/'发布/心锚终端-0.6.1'
notes='''心锚终端 0.6.1 修复说明
一星、二星均跳过词条OCR、评分与标记；仓库连续两帧确认，单张截图也支持，离线重评保留跳过状态。
修复低星区域网格识别：支持三星蓝边、二星绿边、一星灰边，并过滤选中框上边缘产生的伪行。
详细依据列出所有推荐探员和每个方案的匹配分、保留门槛、逐条依据，不再仅复制当前选中的一名探员；推荐名单按姓名去重。
稳定检测失败时保留最后画面和检测到的格子，避免只剩错误文字。日志分别记录一星、二星跳过数量。
已读本轮日志11c0e9ef77a0487aa17d62129eaa5176：233件后“列表滑动后未稳定”，未进入二星跳过分支。
验证使用当前游戏真实一星、二星混合网格截图及该轮历史结果；105项Python回归通过。尚未重新跑完整仓库。
只锁定/标记放弃，不点击解离。双评分规则不变。更新前文件已备份，表格、规则和历史保留。
'''
(SRC/'0.6.1更新说明.txt').write_text(notes,encoding='utf-8-sig')
(SRC/'验证结果.json').write_text(json.dumps({'version':'0.6.1','python_tests':105,'live_low_star_screenshots':True,'full_inventory_rerun':False,'source_run':'11c0e9ef77a0487aa17d62129eaa5176'},ensure_ascii=False,indent=2),encoding='utf-8')
readme=(SRC/'使用说明.txt').read_text(encoding='utf-8-sig')
(SRC/'使用说明.txt').write_text(notes+'\n\n'+readme,encoding='utf-8-sig')
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in {'数据','日志','__pycache__','示例截图'} for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in {'package_release.py','OCR实测.json'}:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
archive=BASE/'发布/心锚终端-0.6.1.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest,encoding='utf-8')
target=Path('F:/心锚终端-0.5.0');backup=target/'更新备份'/('before-0.6.1-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
changed=[Path(n) for n in ['心锚终端.exe','使用说明.txt','验证结果.json','0.6.1更新说明.txt']]
changed += [Path('程序文件')/n for n in ['app.py','desktop.py','engine.py','scoring.py','vision.py','automation.py','game_driver.js','input_guard.js','ui_v4.py','history.py','ocr_worker.py','ocr.js','assets/app.png','assets/app.ico']]
for rel in changed:
 old=target/rel
 if old.exists():p=backup/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(old,p)
 old.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(DEST/rel,old)
shutil.copy2(DEST/'心锚终端.exe',target/'心锚终端-0.6.1.exe');shutil.copy2(archive,target.parent/archive.name)
print(json.dumps({'exe':str(target/'心锚终端-0.6.1.exe'),'zip':str(target.parent/archive.name),'sha256':digest},ensure_ascii=False))
