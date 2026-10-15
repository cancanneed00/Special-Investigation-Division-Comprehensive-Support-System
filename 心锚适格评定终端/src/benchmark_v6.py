from pathlib import Path
import json,time,statistics
from engine import import_workbook,recognize,evaluate
from ocr_worker import close_workers,worker
import vision
BASE=Path(__file__).resolve().parent.parent;ROOT=BASE/'心锚终端'
model=import_workbook(next((ROOT/'表格').glob('*.xlsx')))
baseline=json.loads((BASE/'src/verification/speed-baseline.json').read_text(encoding='utf-8'))
times=[];pids=[]
for i in range(6):
 start=time.perf_counter();obs=recognize(ROOT,ROOT/'示例截图/image10.png',model);times.append(time.perf_counter()-start)
 pids.append(worker(ROOT).proc.pid);ev=evaluate(model,obs)
 assert obs['anchor']==baseline['anchor'] and obs['entries']==baseline['entries']
 assert ev['value_score']==baseline['value_score'] and ev['match_score']==baseline['match_score']
assert len(set(pids))==1
close_workers()
result={'single_old_seconds':baseline['ocr_seconds'],'persistent_seconds':times,'warm_median_seconds':statistics.median(times[1:]),'score_seconds':baseline['score_seconds'],'same_results':True,'one_worker':True}
(BASE/'src/verification/speed-v6.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result))
counts={};two=[]
for folder in [ROOT/'数据',Path('F:/心锚终端-0.5.0/数据')]:
 for p in folder.rglob('*.png'):
  try:r=vision.rarity(vision.image(p))
  except Exception:continue
  counts[str(r)]=counts.get(str(r),0)+1
  if r==2 and len(two)<5:two.append(str(p))
print(json.dumps({'rarity_counts':counts,'two_star_samples':two},ensure_ascii=False))
