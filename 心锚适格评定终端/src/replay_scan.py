"""Replay saved screenshots/OCR without connecting to the game or sending input."""
import json,collections
from pathlib import Path
from engine import Store,reparse_saved,evaluate
ROOT=Path(__file__).resolve().parent.parent/'心锚终端'
RUN=ROOT/'数据/整理记录/16a5f63672124025852ed0b2f3af7db1'
model=Store(ROOT).cached();rows=json.loads((RUN/'results.json').read_text(encoding='utf-8'))
out=[]
for row in rows:
 old=row['observation'];obs=reparse_saved(old,model)
 ev=evaluate(model,obs)
 out.append({'observation':obs,'evaluation':ev,'previous_value_range':row['evaluation']['value_range']})
summary={'count':len(out),'before_with_numeric_range':sum(x['previous_value_range'] is not None for x in out),'after_with_numeric_range':sum(x['evaluation']['value_range'] is not None for x in out),'remaining_reasons':collections.Counter(s for x in out if x['evaluation']['value_range'] is None for s in x['evaluation']['reasons']).most_common(12)}
folder=Path(__file__).resolve().parent/'verification';folder.mkdir(exist_ok=True)
(folder/'replayed-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
(folder/'replay-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
