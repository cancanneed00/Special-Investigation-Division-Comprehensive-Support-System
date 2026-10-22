import unittest,copy,sys,json
from pathlib import Path
from unittest.mock import patch,Mock
sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_engine import EngineTests
from engine import evaluate,value_quality,normalize_stat,parse_ocr
from scoring import DEFAULT_POLICY,decide,validate_policy
import vision,automation
ROOT=Path(__file__).resolve().parent.parent/'心锚终端'

class DualTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  EngineTests.setUpClass();cls.m=EngineTests.m
 def obs(self,n=4):
  o=EngineTests.observation(self)
  for k,v in o['entries'].items():
   r=next(r for r in self.m['rules'] if r['slot']==1 and r['pos']==int(k) and r['stat']==v['stat'])
   v['value']=next(x['value'] for x in r['values'] if x['tier']==1);v['star']=True
  o['presence']={str(i):'present' if i<=n else 'absent' for i in range(1,5)}
  for i in range(n+1,5):o['entries'][str(i)]=None
  return o
 def test_full_counts(self):
  for n in (2,3,4):
   r=evaluate(self.m,self.obs(n));self.assertEqual(r['value_score'],66.67 if n==2 else 100);self.assertEqual(r['entry_count'],n)
   if n==2:self.assertEqual(r['decision'],'标记放弃')
   else:self.assertNotEqual(r['decision'],'标记放弃') # Affinity/presence gates still apply independently.
 def test_between_tiers_still_has_quality(self):
  o=self.obs();o['entries']['1'].update(value='38',star=False)
  r=evaluate(self.m,o);self.assertAlmostEqual(r['value_score'],(38/54*.4+.6)*100,places=2)
  self.assertTrue(r['value_notes']);self.assertNotIn('未覆盖',' '.join(r['reasons']))
 def test_quality_outside_source_range_not_guessed(self):
  for v in ['1','999','nan','-38']:
   self.assertEqual(value_quality(self.m,1,1,'攻击',v,'flat')['scores'],[])
 def test_vulnerability_and_healing_names(self):
  for name in ['全部','物质','异能']:
   r=normalize_stat(name+'易伤','-3.00','percent',[name+'免伤'])
   self.assertEqual((r['stat'],r['value']),(name+'免伤','3.00'));self.assertEqual(r['raw_value'],'-3.00')
  self.assertEqual(normalize_stat('受到治疗','3','percent',['受治疗'])['stat'],'受治疗')
 def test_do_not_strip_arbitrary_negative_sign(self):
  self.assertEqual(normalize_stat('攻击','-38','flat',['攻击'])['value'],'-38')
  self.assertEqual(normalize_stat('全部易伤','3','percent',['全部免伤'])['stat'],'全部易伤')
 def test_clear_zoom_recovers_low_confidence(self):
  items=[{'box':[345,65,100,30],'text':'苍炎狼徽','score':1},
   {'box':[374,111,55,29],'text':'1/10','score':1},
   {'box':[335,168,70,25],'text':'攻击','score':.7},{'box':[480,168,40,25],'text':'38','score':.7},
   {'box':[335,168,70,25],'text':'攻击','score':.99,'rows_zoom':True},{'box':[480,168,40,25],'text':'38','score':.99,'rows_zoom':True}]
  o=parse_ocr(items,self.m);self.assertEqual(o['entries']['1']['value'],'38');self.assertNotIn('词条1OCR置信度偏低',o['issues'])
  items[-1]['text']='41';items[2]['score']=items[3]['score']=.99
  self.assertIn('词条1两次OCR结果不一致',parse_ocr(items,self.m)['issues'])
 def test_name_icon_prefix_stripped(self):
  # 心锚名称前带一个小图标（低置信度、位于名称文本区左侧），不得污染名称识别
  items=[{'box':[312,64,27,33],'text':'全','score':.10},
         {'box':[347,63,109,34],'text':'宝藏挂坠','score':1}]
  o=parse_ocr(items,self.m)
  self.assertEqual(o['anchor'],'宝藏挂坠')
  self.assertFalse([s for s in o['issues'] if s.startswith('名称需核对')])
 def test_name_variant_char_resolved(self):
  # OCR 简繁异体(掛/挂)+前置图标，应归一到表格名，不报名称需核对
  items=[{'box':[312,64,27,33],'text':'全','score':.10},
         {'box':[345,65,111,31],'text':'宝藏掛坠','score':.96}]
  o=parse_ocr(items,self.m)
  self.assertEqual(o['anchor'],'宝藏挂坠')
  self.assertFalse([s for s in o['issues'] if s.startswith('名称需核对')])
 def test_unknown_name_kept_for_review(self):
  # 未知/高歧异名称不静默错配，保留人工复核
  o=parse_ocr([{'box':[345,65,120,31],'text':'精雕紫钻钥匙','score':.9}],self.m)
  self.assertTrue(any(s.startswith('名称需核对') for s in o['issues']))
 def test_unknown_not_absent(self):
  o=self.obs(3);o['presence'].pop('4');self.assertEqual(evaluate(self.m,o)['decision'],'跳过复核')
 def test_independent_scores(self):
  o=self.obs();a=evaluate(self.m,o);o['entries']['2'].update(value='3.96',star=False);b=evaluate(self.m,o)
  self.assertLess(b['value_score'],a['value_score']);self.assertEqual(a['match_score'],b['match_score'])
 def test_bad_unit(self):
  o=self.obs();o['entries']['1']['unit']='percent';self.assertEqual(evaluate(self.m,o)['decision'],'跳过复核')
 def test_unreadable(self):
  o=self.obs();o['issues']=['低置信'];self.assertEqual(evaluate(self.m,o)['decision'],'跳过复核')
 def test_unrecommended(self):self.assertEqual(evaluate(self.m,self.obs(),['犬齿'])['matches'][0]['character'],'犬齿')
 def test_disabled(self):
  p=copy.deepcopy(DEFAULT_POLICY)
  p['keep']['enabled']=p['discard']['enabled']=p['keep']['perfect_enabled']=False
  self.assertEqual(evaluate(self.m,self.obs(),policy=p)['decision'],'跳过')
 def test_invalid_threshold(self):
  p=copy.deepcopy(DEFAULT_POLICY);p['keep']['match_threshold']=float('nan')
  with self.assertRaises(ValueError):validate_policy(p)
 def test_stars(self):
  for name,stars in [('image1.png',[True,False,True,True]),('image10.png',[True,False,False,True])]:
   im=vision.image(ROOT/'示例截图'/name);self.assertEqual([vision.star(im,i) for i in range(1,5)],stars)
 def test_grid(self):
  for name in ['image1.png','image10.png']:
   im=vision.image(ROOT/'示例截图'/name);cells=vision.grid_cells(im);self.assertGreaterEqual(len(cells),10)
   selected=[c for c in cells if vision.selected_cell(im,c['col'],c['y'])];self.assertEqual(len(selected),1,(name,cells,selected))
 def test_existing_lock(self):
  b=Mock();p=ROOT/'示例截图/image1.png';self.assertIn('已锁定',automation.mark_one(b,p,'标记放弃'));b.rpc.assert_not_called()
 def test_no_repeat_when_unverified(self):
  b=Mock();p=ROOT/'示例截图/image10.png';b.capture.return_value=p
  with self.assertRaises(RuntimeError):automation.mark_one(b,p,'锁定')
  self.assertEqual(b.rpc.call_count,1)
 def test_success_one_input(self):
  b=Mock();p=ROOT/'示例截图/image10.png';b.capture.return_value=p
  with patch('vision.mark_state',side_effect=['off','off','on']):self.assertEqual(automation.mark_one(b,p,'标记放弃'),'标记放弃成功')
  self.assertEqual(b.rpc.call_count,1)
 def test_stop_no_input(self):
  b=Mock();b.check.side_effect=automation.Stopped();p=ROOT/'示例截图/image10.png'
  with self.assertRaises(automation.Stopped):automation.mark_one(b,p,'锁定')
  b.rpc.assert_not_called()

if __name__=='__main__':
 suite=unittest.TestSuite()
 for name in ['test_import','test_min_normalized','test_duplicate_id_preserved','test_ambiguity','test_tolerance','test_units','test_integer_tie','test_nonfinite','test_cache_atomic']:suite.addTest(EngineTests(name))
 suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(DualTests))
 result=unittest.TextTestRunner(verbosity=2).run(suite);sys.exit(not result.wasSuccessful())
