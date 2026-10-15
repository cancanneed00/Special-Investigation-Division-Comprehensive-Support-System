import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import app,desktop
app.ROOT=desktop.ROOT=Path(__file__).resolve().parent.parent/'心锚终端'
a=desktop.App();a.withdraw()
try:
 m,changed=a.store.load(a.store.files()[0]);a.accept_model((m,changed));assert a.people.size()==40
 assert len(a.tabs.tabs())==5
 data=json.loads((app.ROOT/'OCR实测.json').read_text(encoding='utf-8'))
 for r in data:
  a.accept_obs(r['observation']);a.update_idletasks();assert len(a.fields.get_children())==4;assert len(a.results.get_children())==40
 a.agent.set('犬齿');a.calculate();assert len(a.result['matches'])==1
 for k in a.policyvars:
  for metric in ('value','match'):a.policyvars[k][metric+'_enabled'].set(False)
 a.calculate();assert a.result['decision']=='跳过'
 assert not hasattr(a,'confirm')
 assert a.scrollvar.get()
 assert '扫描全部' in a.startbtn.cget('text') and '只评分' in a.batchbtn.cget('text')
 print('Desktop 5 tabs, batch entry points, read-only fields, 40 agents, policy callbacks: passed')
finally:a.destroy()
