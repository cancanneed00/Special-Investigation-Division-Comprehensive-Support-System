from pathlib import Path
import json,zipfile,hashlib,shutil
BASE=Path(__file__).resolve().parent.parent
SRC=BASE/'心锚终端';DEST=BASE/'发布/心锚终端-0.3.0'
DEST.mkdir(parents=True,exist_ok=True)
exclude={'数据','日志','__pycache__'}
for p in SRC.rglob('*'):
 rel=p.relative_to(SRC)
 if not p.is_file() or any(x in exclude for x in rel.parts) or p.name.startswith(('test_','smoke_','guard-')) or p.name in ['package_release.py','OCR实测.json']:continue
 q=DEST/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
readme='''心锚终端 0.3.0

完整解压后双击心锚终端.exe，不要单独移动EXE。无需安装Python或Node。
将推荐xlsx放入“表格”文件夹，启动自动生成数据库。已有数据库会重新读取表格以更新特殊规则。

推荐保留（默认匹配分至少80）
同一探员、同一条推荐必须同时满足匹配分及以下条件，不能用另一条推荐的数值来补。
重要（加粗）词条：第1—2档。
普通、不重要、皆可、其他词条：允许第1—3档。第4—6档只阻止保留，不因单条低值就放弃。
红字词条和特性不可替代，重要特性须匹配。
min：越低越好，允许最低两档；按该词条实际具有的档位反向计算。
备注明确“生命词条越低越好”“对暴击词条可放低要求”时应用相应规则。
配队、拓变、环境等条件备注保留原文，不自动假定当前队伍满足条件。

独立数值筛选
默认仅有2条及以下，或全部现有词条都在第4档及以下时标记放弃。
3条心锚不会仅因缺1条而放弃。第四词条存在就是第1档，因此不属于全部低档。
缺条过多优先筛出；其他情况下满足推荐及min特殊条件的保留优先。
匹配分低本身不触发放弃；高平均数值分也不能绕过保留档位条件。
数值分仍为现有词条“当前值/满值”的平均，独立于探员推荐和min方向；缺条数量单独判断。
匹配分红字权重5、加粗3、普通1，特性乘0.5；整格皆可/不重要不进入分母；> 每级降0.2，≥ 降0.1，= 不降。这些权重是程序约定。
两套规则可在“保留与放弃规则”中独立启用。旧版任一分数达标即保留的设置自动迁移为新档位规则。

表内值之间保留相邻档位区间，跨越规则边界时待复核，不猜成更高档。
未知数值、缺失未确认或OCR冲突不会执行标记，批量结果显示原因。
可在“本轮全部结果”载入上轮记录并重新评分，不操作游戏。

游戏扫描
打开16:9游戏窗口并停在心锚仓库，使用“扫描全部心锚（只评分）”预览。
扫描前自动确认低等级在前，回顶部逐件识别和拖动翻页。需要完整仓库时先清除游戏筛选。
鼠标实际点击和拖动列表，不移动游戏窗口；保持游戏可见，扫描期间避免同时操作鼠标。
停止按钮或F8可停止；无法确认连续翻页或画面状态时停止。
“扫描全部并按规则标记”仅使用左侧锁定/标记放弃，不解锁已有锁定，绝不点击解离。
仅处理1级心锚，已强化数值不在当前范围。结果和截图保存在“数据/整理记录”。

验证
71项导入、评分、图像、批量扫描及模拟操作测试通过。
224件旧记录离线重算结果见验证结果.json。本次没有操作游戏中的标记。
上一版实测跨4页扫描55件，游戏窗口位置保持不变；尚未验证完整仓库结束和实际锁定/放弃图标联调。
评分通过不等于OCR准确率100%；未识别或条件不明确的条目仍需复核。
OCR本地运行，不上传截图。第三方许可见第三方许可及各运行库目录。
'''
(DEST/'使用说明.txt').write_text(readme,encoding='utf-8-sig')
(SRC/'使用说明.txt').write_text(readme,encoding='utf-8-sig')
summary=json.loads((BASE/'src/verification/scoring-v3-summary.json').read_text(encoding='utf-8'))
summary.update(unit_tests=71,full_warehouse_completion_verified=False,live_marking_verified=False)
for folder in [DEST,SRC]:(folder/'验证结果.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
archive=BASE/'发布/心锚终端-0.3.0.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in DEST.rglob('*'):
  if p.is_file():z.write(p,Path(DEST.name)/p.relative_to(DEST))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(digest+'  '+archive.name,encoding='utf-8')
print(json.dumps({'exe':str(DEST/'心锚终端.exe'),'zip':str(archive),'bytes':archive.stat().st_size,'sha256':digest},ensure_ascii=False))
