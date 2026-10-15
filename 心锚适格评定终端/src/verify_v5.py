import json,collections,copy
from pathlib import Path
from engine import import_workbook,evaluate
from scoring import DEFAULT_POLICY
root=Path(__file__).resolve().parent.parent
model=import_workbook(next((root/'心锚终端/表格').glob('*.xlsx')))
rows=json.loads((root/'src/verification/replayed-results.json').read_text(encoding='utf-8'))
report={}
old=copy.deepcopy(DEFAULT_POLICY);old['discard'].update(joint_enabled=False,weak_enabled=False)
old_kept={i for i,row in enumerate(rows) if evaluate(model,row['observation'],policy=old)['decision']=='锁定'}
for threshold in [60,70,80]:
 p=copy.deepcopy(DEFAULT_POLICY);p['discard']['joint_match']=threshold
 results=[evaluate(model,row['observation'],policy=p) for row in rows]
 report[str(threshold)]=dict(collections.Counter(e['decision'] for e in results))
 assert {i for i,e in enumerate(results) if e['decision']=='锁定'}==old_kept
 for e in results:
  if e['decision']=='锁定':assert e['eligible_matches'] or e['value_range'][0]>95
  if e['decision']=='标记放弃':assert not e.get('eligible_matches')
summary={'version':'0.5.0','offline_samples':len(rows),'threshold_comparison':report,'policy':DEFAULT_POLICY,'tests':89,'game_inputs':0}
(root/'src/verification/v5-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
