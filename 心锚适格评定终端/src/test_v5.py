import copy,unittest
from test_scoring_v3 import ScoringRulesTests
from engine import import_workbook
from pathlib import Path

class RevisedTests(ScoringRulesTests):
 def test_joint_low_match_and_quality(self):
  self.m['characters']=[];self.value(1,3)
  self.assertEqual(self.ev()['decision'],'标记放弃')
 def test_joint_boundary_is_strict(self):
  self.m['characters']=[];self.value(3,4);self.p['discard']['joint_value']=94
  self.assertEqual(self.ev()['decision'],'跳过')
 def test_joint_can_be_disabled(self):
  self.m['characters']=[];self.value(1,3);self.p['discard']['joint_enabled']=False
  self.assertEqual(self.ev()['decision'],'跳过')
 def test_min_kept_despite_low_quality(self):
  self.m['characters'][0]['recs'][0]['entries'][0]['tokens'][0]['direction']='min';self.value(1,6)
  self.assertEqual(self.ev()['decision'],'锁定')
 def scale_tiers(self,koef):
  """把 fixture 的 30 级列写成 1级×10/3，再把每条词条换成「某等级下的显示值」。"""
  for rule in self.m['rules']:
   rule['values30']=[dict(v,value=str(float(v['value'])*10/3)) for v in rule['values']]
  for item in self.o['entries'].values():item['value']='%.2f'%(float(item['value'])*koef)
 def test_30_converts_back_to_level1(self):
  self.scale_tiers(10/3);self.o['level']=30;e=self.ev()
  self.assertEqual(e['decision'],'仅评分');self.assertEqual(e['value_score'],100)
  self.assertEqual(e['value_details'][0]['level1'],'100')
  self.assertEqual(e['value_details'][0]['level_n'],30)
 def test_20_uses_20_curve(self):
  self.scale_tiers(2.5);self.o['level']=20;e=self.ev()
  self.assertEqual(e['decision'],'仅评分')
  self.assertEqual(e['value_details'][0]['level1'],'100')
 def test_10_uses_10_curve(self):
  self.scale_tiers(2.0);self.o['level']=10;e=self.ev()
  self.assertEqual(e['decision'],'仅评分')
  self.assertEqual(e['value_details'][0]['level1'],'100')
 def test_non_first_level_never_locks_or_discards(self):
  self.scale_tiers(10/3);self.o['level']=30
  for key in [1,2,3,4]:self.o['entries'][str(key)]['star']=False
  e=self.ev();self.assertEqual(e['decision'],'仅评分')
  self.assertTrue(any('不做保留 / 放弃标记' in x for x in e['reasons']))
 def test_30_missing_table_is_review(self):
  self.o['level']=30;self.assertEqual(self.ev()['decision'],'跳过复核')
 def test_other_levels_without_curve_is_review(self):
  # 没有 30 级列就没有满级端点，把 20 级显示值当 1 级值会虚高，只能交复核。
  self.o['level']=20;self.assertEqual(self.ev()['decision'],'跳过复核')
 def test_source_30_cells(self):
  m=import_workbook(next((Path(__file__).resolve().parent.parent/'心锚终端/表格').glob('*.xlsx')))
  r=m['rules'][0];self.assertEqual(r['values30'][0]['value'],'180');self.assertEqual(r['values30'][0]['source'],'D5')
  self.assertEqual(r['values'][0]['value'],'54');self.assertEqual(len(m['rules']),116)

if __name__=='__main__':
 suite=unittest.TestSuite(RevisedTests(n) for n in RevisedTests.__dict__ if n.startswith('test_'))
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 raise SystemExit(not result.wasSuccessful())
