"""Compare saved observations under v0.3 rules; no game input or OCR execution."""
import json,collections
from pathlib import Path
from engine import import_workbook,evaluate
from scoring import DEFAULT_POLICY
root=Path(__file__).resolve().parent.parent
model=import_workbook(next((root/'心锚终端/表格').glob('*.xlsx')))
rows=json.loads((root/'src/verification/replayed-results.json').read_text(encoding='utf-8'))
result=[]
for row in rows:
 old=row['evaluation'];new=evaluate(model,row['observation'])
 if new['decision']=='锁定':
  assert new['eligible_matches']
  assert not new['quality_filter']['count_too_low']
 if new['decision']=='标记放弃':assert new['quality_filter']['bad'] is True
 result.append({'observation':row['observation'],'previous_decision':old['decision'],'evaluation':new})
summary={'version':'0.3.0','count':len(rows),'policy':DEFAULT_POLICY,
 'before':dict(collections.Counter(x['previous_decision'] for x in result)),
 'after':dict(collections.Counter(x['evaluation']['decision'] for x in result)),
 'changed':sum(x['previous_decision']!=x['evaluation']['decision'] for x in result),
 'retained_to_skipped':sum(x['previous_decision']=='锁定' and x['evaluation']['decision']=='跳过' for x in result),
 'unscored':sum(x['evaluation']['value_range'] is None for x in result),
 'game_inputs':0}
folder=root/'src/verification'
(folder/'scoring-v3-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(folder/'scoring-v3-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
