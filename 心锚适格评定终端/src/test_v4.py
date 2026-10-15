import unittest,copy,tempfile,json,os,time
from pathlib import Path
from PIL import Image
from test_scoring_v3 import ScoringRulesTests
from scoring import evaluate_dual
import history

class LatestRulesTests(ScoringRulesTests):
 def test_perfect_direct_keep_without_any_agent(self):
  self.p['keep']['perfect_enabled']=True;self.m['characters']=[];self.assertEqual(self.ev()['decision'],'锁定');self.assertEqual(self.ev()['matches'],[])
 def test_exact_95_is_not_direct_keep(self):
  self.p['keep']['perfect_enabled']=True;self.m['characters']=[]
  self.o['entries']['3'].update(value='75',star=False)
  r=self.ev();self.assertEqual(r['value_score'],95);self.assertEqual(r['decision'],'跳过')
 def test_fourth_has_deciding_weight(self):
  self.p['keep']['perfect_enabled']=True;self.m['characters']=[]
  self.o['entries']['1'].update(value='89',star=False)
  self.assertEqual(self.ev()['value_score'],95.6);self.assertEqual(self.ev()['decision'],'锁定')
  self.missing(4);self.assertLess(self.ev()['value_score'],95.6)
 def test_primary_weight_higher(self):
  self.value(1,3);a=self.ev()['value_score'];self.value(1,1);self.value(3,3);b=self.ev()['value_score'];self.assertLess(a,b)
 def test_unknown_trait_does_not_block(self):
  self.o['issues']=['特性2OCR置信度偏低'];self.o['traits']['2']=None;self.assertEqual(self.ev()['decision'],'锁定')
 def test_inflated_variant_uses_own_maximum(self):
  r=copy.deepcopy(self.m['rules'][0]);r['variant']='攻击2'
  for v in r['values']:v['value']=str(int(v['value'])*2)
  self.m['rules'].append(r);self.o['entries']['1'].update(value='180',star=False)
  e=self.ev();self.assertEqual(e['value_score'],96);self.assertEqual(e['value_details'][0]['tier'],'2档')
 def test_overlapping_variants_preserve_interval(self):
  r=copy.deepcopy(self.m['rules'][0]);r['variant']='攻击2'
  for v in r['values']:v['value']=str(int(v['value'])*2)
  self.m['rules'].append(r);self.o['entries']['1']['star']=None
  self.p['keep']['perfect_enabled']=True;e=self.ev();self.assertEqual(e['value_range'],[80,100]);self.assertEqual(e['decision'],'跳过复核')

class HistoryTests(unittest.TestCase):
 def test_archive_and_prune_preserve_summary(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);run=root/'数据/整理记录'/('a'*32);run.mkdir(parents=True)
   im=root/'source.png';Image.new('RGB',(1280,720),'red').save(im)
   row={'observation':{'image':str(im),'anchor':'样本'},'evaluation':{'matches':[],'eligible_matches':[],'value_score':100,'value_range':[100,100],'match_score':None,'decision':'锁定','reasons':['数值保留']}}
   dest=history.archive(root,run,[row]);self.assertTrue((dest/'0001.png').exists());self.assertTrue((dest/'结果摘要.csv').exists())
   os.utime(dest/'0001.png',(time.time()-9*86400,)*2);history.prune(root)
   self.assertFalse((dest/'0001.png').exists());self.assertTrue((dest/'results.json').exists());self.assertTrue(im.exists())
 def test_cleanup_does_not_touch_outside_paths(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);outside=root/'other';outside.mkdir();f=outside/'frame-1.png';f.write_bytes(b'keep')
   history.clear_run_temporaries(root,outside,[]);self.assertTrue(f.exists())

if __name__=='__main__':
 # Inherited v3 cases are already run by their dedicated suite.
 suite=unittest.TestSuite()
 for cls in [LatestRulesTests,HistoryTests]:
  for name in cls.__dict__:
   if name.startswith('test_'):suite.addTest(cls(name))
 result=unittest.TextTestRunner(verbosity=2).run(suite);raise SystemExit(not result.wasSuccessful())
