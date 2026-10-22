import unittest,tempfile,threading,json
from pathlib import Path
from unittest.mock import patch,Mock
from contextlib import ExitStack
import vision,automation,engine,ui_v4
from test_batch import FakeBridge
HERE=Path(__file__).resolve().parent
EVENT_MODEL={'anchors':{'雀姬奇物':{'name':'雀姬奇物','slot':2,'pools':{'1':['生命'],'2':['护甲'],'3':['生命'],'4':[]},'traits':{'1':['蓄势待发2'],'2':['破绽百出1']}}},'characters':[],'characters5':[],'rules':[],'hash':'test'}

class FixTests(unittest.TestCase):
 def test_real_low_star_grid(self):
  for name,stars in [('one-star.png',1),('low-stars.png',2)]:
   im=vision.image(HERE/'reference'/name)
   self.assertEqual(vision.rarity(im),stars)
   cells=vision.grid_cells(im);self.assertEqual(len(cells),15)
   self.assertEqual([c['col'] for c in cells],list(range(5))*3)
   ys=sorted({c['y'] for c in cells});self.assertEqual(len(ys),3)
   self.assertTrue(all(128<=b-a<=132 for a,b in zip(ys,ys[1:])))
 def test_low_star_name_only_ocr_in_batch_and_single(self):
  # 低星不再整体跳过：批量与单件都做仅名称识别；百科中的活动心锚保留且绝不标记
  for name,stars in [('one-star.png',1),('low-stars.png',2)]:
   with tempfile.TemporaryDirectory(dir=HERE) as root:
    frame=HERE/'reference'/name;b=FakeBridge(root,threading.Event());b.capture=lambda:frame;rows=[]
    with ExitStack() as s:
     s.enter_context(patch('automation.time.sleep'))
     s.enter_context(patch('vision.image',side_effect=lambda p:p))
     s.enter_context(patch('vision.grid_cells',return_value=[{'col':2,'y':261}]))
     s.enter_context(patch('vision.selected_cell',return_value=True))
     s.enter_context(patch('vision.detail_same',return_value=True))
     mark=s.enter_context(patch('automation.mark_one'))
     automation.run_inventory(root,EVENT_MODEL,{},None,b.stop,lambda r,n:rows.append(r),max_items=1,scroll=False,bridge_factory=lambda *a:b,
      recognizer=lambda *a:{'anchor':'雀姬奇物','level':1,'rarity':stars,'entries':{},'traits':{},'issues':[],'image':str(frame)},apply_marks=True)
    mark.assert_not_called()
    self.assertEqual(rows[0]['observation']['rarity'],stars)
    self.assertEqual(rows[0]['evaluation']['decision'],'活动心锚')
    self.assertEqual(rows[0]['action'],'活动心锚 · 可保留使用')
    with patch('ocr_worker.worker') as w:
     w.return_value.request.side_effect=lambda i,o,stop=None:Path(o).write_text(json.dumps([{'detail':{'all':[
      {'box':[345,65,111,31],'text':'雀姬奇物','score':.95},{'box':[374,111,55,29],'text':'1/30','score':.9}]}}]),encoding='utf-8')
     with patch('vision.rarity',return_value=stars):
      obs=engine.recognize(root,frame,EVENT_MODEL)
     self.assertEqual(obs['anchor'],'雀姬奇物');self.assertEqual(obs['rarity'],stars);self.assertEqual(obs['level'],1)
     self.assertEqual(engine.reparse_saved(obs,EVENT_MODEL)['anchor'],'雀姬奇物')
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
