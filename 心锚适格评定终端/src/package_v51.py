from pathlib import Path
import json,zipfile,hashlib,shutil,datetime
BASE=Path(__file__).resolve().parent.parent;SRC=BASE/'心锚终端';DEST=BASE/'发布/心锚终端-0.5.1'
DEST.mkdir(parents=True,exist_ok=True)
exclude={'数据','日志','__pycache__','示例截图'}
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in exclude for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in ['package_release.py','OCR实测.json']:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
notes='''心锚终端 0.5.1 修复说明

图标：保留原素材透明通道，透明补边并裁去多余外沿；不再出现上下不透明条。
翻页：拖动后停留400毫秒再松开，降低惯性过冲；唯一选中框与不变详情共同确认连续行，不依赖卡面动画逐像素相同。
恢复：重叠无法确认时，最多3次缓慢回退定位，恢复只滑动列表，不重复发送锁定/放弃。
诊断：失败时保存navigation-before.png、navigation-after.png及navigation.json，纳入7天/300MB截图清理规则。

所读F盘日志：ab51b956970a44a386f8e9e4b43a3dee，处理20件，第一次向下翻页后主动保护停止；原日志无翻页前后截图，无法判定具体画面原因。
验证：23项扫描及恢复测试、已有评分/归档测试通过，拖动协议和输入白名单通过；当前电脑未打开游戏，尚未进行实机跨页复测。
保留0.5.0双评分规则、单件30级评分及仓库仅1级限制。只锁定/标记放弃，不点击解离。
'''
summary={'version':'0.5.1','log_run':'ab51b956970a44a386f8e9e4b43a3dee','stopped_after':20,'cause':'overlap_unconfirmed','exact_visual_cause_available':False,'navigation_tests':23,'live_cross_page_verified':False,'game_inputs':0}
for folder in [SRC,DEST]:
 (folder/'0.5.1修复说明.txt').write_text(notes,encoding='utf-8-sig')
 (folder/'验证结果.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
 readme=(folder/'使用说明.txt').read_text(encoding='utf-8-sig').replace('心锚终端 0.5.0','心锚终端 0.5.1')
 (folder/'使用说明.txt').write_text(readme+'\n\n'+notes,encoding='utf-8-sig')
archive=BASE/'发布/心锚终端-0.5.1.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest,encoding='utf-8')
# Update only executable/code/assets in the supplied installation; retain workbook/data/logs.
target=Path('F:/心锚终端-0.5.0');backup=target/'更新备份'/('0.5.0-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
changed=[Path('心锚终端.exe'),Path('使用说明.txt'),Path('验证结果.json'),Path('0.5.1修复说明.txt')]
changed += [Path('程序文件')/n for n in ['engine.py','automation.py','vision.py','history.py','game_driver.js','input_guard.js','assets/app.png','assets/app.ico']]
for rel in changed:
 old=target/rel
 if old.exists():saved=backup/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(old,saved)
 old.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(DEST/rel,old)
# New executable filename also bypasses Explorer's icon cache for the old path.
shutil.copy2(DEST/'心锚终端.exe',target/'心锚终端-0.5.1.exe')
shutil.copy2(archive,target.parent/archive.name)
print(json.dumps({'zip':str(archive),'f_exe':str(target/'心锚终端-0.5.1.exe'),'backup':str(backup),'sha256':digest},ensure_ascii=False))
