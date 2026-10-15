from pathlib import Path
import json,zipfile,hashlib,shutil,datetime
BASE=Path(__file__).resolve().parent.parent;SRC=BASE/'心锚终端';DEST=BASE/'发布/心锚终端-0.6.0'
DEST.mkdir(parents=True,exist_ok=True)
exclude={'数据','日志','__pycache__','示例截图'}
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in exclude for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in ['package_release.py','OCR实测.json']:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
bench=json.loads((BASE/'src/verification/speed-v6.json').read_text(encoding='utf-8'))
notes='''心锚终端 0.6.0 性能优化说明

1. OCR改为单个常驻进程，复用CPU模型；串行识别，避免多进程占满一般电脑的CPU和内存。停止/错误后结束识别进程，下次自动重建。
2. 等待画面稳定的只读截图不重复做仓库OCR；每次点击或滑动仍校验仓库界面、截图尺寸和动态模板。
3. 操作前模板通过内存更新并固定复用，不再反复加载资源包；保留详情变化校验和输入白名单。
4. 连续两帧确认二星后，跳过词条OCR、评分和标记。仍需选中查看星级；星级不确定时正常识别，不凭猜测跳过。
5. summary.json增加总耗时、OCR耗时、二星跳过数量、各类驱动请求耗时，便于排查不同电脑的性能。

本机离线同图实测：旧单次OCR约1.139秒，新版连续5次中位数约0.456秒；词条与双评分完全一致。评分本身约0.0016秒。
这些是本机截图识别数据，不是整仓速度，也不代表低配置电脑的实际耗时。未实机复测本版完整跨页扫描。
真实二星截图和三星截图测试、100项Python回归测试、2305个输入位置白名单、原生模型复用/停止/重启、原生动态模板复用测试通过。
“先全截图，再全部评分”没有减少OCR总量；评分计算很轻。若要自动标记，还需重新定位物品，本版保留逐件校验处理。

从旧版更新后，请退出旧程序，再启动0.6.0。保留原表格、规则设置、日志和历史。
只锁定/标记放弃，不点击解离；仓库仅处理1级，单件支持1级/30级。评分规则没有改变。
'''
summary={'version':'0.6.0','python_tests':100,'benchmark':bench,'two_star_real_fixture':True,'native_worker_lifecycle_verified':True,'native_template_override_verified':True,'live_cross_page_verified':False,'game_inputs':0}
for folder in [SRC,DEST]:
 (folder/'0.6.0更新说明.txt').write_text(notes,encoding='utf-8-sig')
 (folder/'验证结果.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
 text=(folder/'使用说明.txt').read_text(encoding='utf-8-sig').replace('心锚终端 0.5.1','心锚终端 0.6.0')
 (folder/'使用说明.txt').write_text(text+'\n\n'+notes,encoding='utf-8-sig')
archive=BASE/'发布/心锚终端-0.6.0.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest,encoding='utf-8')
target=Path('F:/心锚终端-0.5.0');backup=target/'更新备份'/('before-0.6.0-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
if target.exists():
 changed=[Path('心锚终端.exe'),Path('使用说明.txt'),Path('验证结果.json'),Path('0.6.0更新说明.txt')]
 changed += [Path('程序文件')/n for n in ['app.py','desktop.py','engine.py','scoring.py','vision.py','automation.py','game_driver.js','input_guard.js','ui_v4.py','history.py','ocr_worker.py','ocr.js','assets/app.png','assets/app.ico']]
 for rel in changed:
  old=target/rel
  if old.exists():saved=backup/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(old,saved)
  old.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(DEST/rel,old)
 shutil.copy2(DEST/'心锚终端.exe',target/'心锚终端-0.6.0.exe');shutil.copy2(archive,target.parent/archive.name)
print(json.dumps({'zip':str(archive),'f_exe':str(target/'心锚终端-0.6.0.exe'),'backup':str(backup),'sha256':digest},ensure_ascii=False))
