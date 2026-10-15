import unittest,tempfile,threading,json
from pathlib import Path
from unittest.mock import patch,Mock
from contextlib import ExitStack
import vision,automation,engine,ui_v4
from test_batch import FakeBridge
HERE=Path(__file__).resolve().parent
class FixTests(unittest.TestCase):
 def test_real_low_star_grid(self):
  for name,stars in [('one-star.png',1),('low-stars.png',2)]:
   im=vision.image(HERE/'reference'/name)
   self.assertEqual(vision.rarity(im),stars)
   cells=vision.grid_cells(im);self.assertEqual(len(cells),15)
   self.assertEqual([c['col'] for c in cells],list(range(5))*3)
   ys=sorted({c['y'] for c in cells});self.assertEqual(len(ys),3)
   self.assertTrue(all(128<=b-a<=132 for a,b in zip(ys,ys[1:])))
 def test_both_low_stars_skip_batch_and_single(self):
  for name,stars in [('one-star.png',1),('low-stars.png',2)]:
   with tempfile.TemporaryDirectory(dir=HERE) as root:
    frame=HERE/'reference'/name;b=FakeBridge(root,threading.Event());b.capture=lambda:frame
    rec=Mock();mark=Mock();rows=[]
    with ExitStack() as s:
     s.enter_context(patch('automation.time.sleep'));s.enter_context(patch('vision.grid_cells',return_value=[{'col':2,'y':261}]))
     s.enter_context(patch('vision.selected_cell',return_value=True));s.enter_context(patch('automation.mark_one',mark))
     automation.run_inventory(root,{}, {},None,b.stop,lambda r,n:rows.append(r),max_items=1,scroll=False,bridge_factory=lambda *a:b,recognizer=rec,apply_marks=True)
    rec.assert_not_called();mark.assert_not_called();self.assertEqual(rows[0]['observation']['rarity'],stars)
    with patch('ocr_worker.worker') as w:
     obs=engine.recognize(root,frame,{});w.assert_not_called();self.assertEqual(obs['rarity'],stars)
     self.assertEqual(engine.reparse_saved(obs,{})['rarity'],stars)
 def test_low_star_stable_frame_completes_wait(self):
  b=Mock();b.capture.return_value=HERE/'reference/low-stars.png'
  with patch('automation.time.sleep'):
   self.assertEqual(automation.wait_grid_still(b),b.capture.return_value)
  self.assertEqual(b.capture.call_count,3)
 def test_details_list_every_person_and_alternative(self):
  e={'eligible_matches':[{'character':'甲','rank':2},{'character':'乙','rank':1}], 'matches':[
   {'character':'甲','alternatives':[{'rank':1,'score':100},{'rank':2,'score':90}]},
   {'character':'乙','rank':1,'score':88},{'character':'丙','rank':1,'score':50}]}
  text=ui_v4.all_match_details(e)
  self.assertIn('满足推荐保留：甲、乙',text)
  for n in '甲乙丙':self.assertIn('【'+n+'】',text)
  self.assertIn('推荐 2 · 匹配 90 分 · 满足推荐保留',text)
  self.assertIn('推荐 1 · 匹配 100 分 · 未满足推荐保留',text)
 def test_real_run_details_cover_eligible_people(self):
  path=HERE.parent/'心锚终端/数据/整理记录/f89569042eac41b7928b85bc63c0365d/results.json'
  rows=json.loads(path.read_text(encoding='utf-8'));checked=0
  for row in rows:
   e=row['evaluation'];names={m['character'] for m in e.get('eligible_matches',[])}
   if len(names)>1:
    text=ui_v4.all_match_details(e)
    for name in names:self.assertIn('【'+name+'】',text)
    checked+=1
  self.assertGreater(checked,0)

if __name__=='__main__':unittest.main(verbosity=2)
