from pathlib import Path
import json,collections
from engine import import_workbook
import openpyxl
root=Path(__file__).resolve().parent.parent
book=next((root/'心锚终端/表格').glob('*.xlsx'))
m=import_workbook(book)
w=openpyxl.load_workbook(book,data_only=True,rich_text=True)
for s in ['词条数值','六星角色心锚推荐']:
 print(s,[(c.coordinate,str(c.value)) for row in w[s].iter_rows(max_row=3) for c in row if c.value])
counts=collections.Counter(e['raw'] for ch in m['characters'] for r in ch['recs'] for e in r['entries'])
print('RECOMMENDATION VALUES',json.dumps(counts,ensure_ascii=False))
for ch in m['characters']:
 for r in ch['recs']:
  special=[e for e in r['entries'] if any(s in e['raw'].lower() for s in ['min','不重要','皆可','无'])]
  if special: print(json.dumps({'character':ch['name'],'anchor':r['anchor'],'note':ch['note'],'special':special},ensure_ascii=False))
