"""Developer check of widget construction/callbacks, with the window withdrawn."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import app
app.ROOT=Path(__file__).resolve().parent.parent/'心锚终端'
a=app.App();a.withdraw()
try:
 m,changed=a.store.load(a.store.files()[0]);a.accept_model((m,changed))
 assert a.people.size()==40
 assert len(a.tabs.tabs())==3
 data=json.loads((app.ROOT/'OCR实测.json').read_text(encoding='utf-8'))
 for r in data:
  a.accept_obs(r['observation']);a.update_idletasks()
  assert a.result['decision']=='建议放弃',a.result
  assert a.results.get_children()
 a.agent.set('犬齿');a.calculate()
 assert len(a.result['matches'])==1
 a.fields[3][0].set('物质伤害');a.calculate();assert a.result['decision']=='待复核'
 a.confirm.set(True);a.calculate();assert a.result['decision']=='建议锁定'
 a.threshold.set('99');a.calculate();assert a.result['decision']=='建议放弃'
 print(json.dumps({'widget_construction':'passed','catalog':40,'tabs':3,'ocr_form_population':2,'filter_and_correction':'passed','threshold_change':'passed','visual_screen_review':'not performed'},ensure_ascii=False))
finally:a.destroy()
