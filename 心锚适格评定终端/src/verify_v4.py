import json,collections
from pathlib import Path
from engine import import_workbook,evaluate
from scoring import DEFAULT_POLICY
root=Path(__file__).resolve().parent.parent
model=import_workbook(next((root/'心锚终端/表格').glob('*.xlsx')))
rows=json.loads((root/'src/verification/replayed-results.json').read_text(encoding='utf-8'));results=[]
for row in rows:
 e=evaluate(model,row['observation'])
 if e['decision']=='锁定':assert e['eligible_matches'] or e['value_range'][0]>95
 if e['decision']=='标记放弃':assert e['quality_filter']['bad'] is True
 results.append({'observation':row['observation'],'evaluation':e})
summary={'version':'0.4.0','offline_samples':len(results),'decisions':dict(collections.Counter(r['evaluation']['decision'] for r in results)),'policy':DEFAULT_POLICY,'value_weights':[40,30,20,10],'tests':80,'game_inputs':0}
(root/'src/verification/v4-results.json').write_text(json.dumps(results,ensure_ascii=False),encoding='utf-8')
(root/'src/verification/v4-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
