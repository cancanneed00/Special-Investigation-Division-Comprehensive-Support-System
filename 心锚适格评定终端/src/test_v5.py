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
 def test_30_uses_own_numbers(self):
  for rule in self.m['rules']:
   rule['values30']=[dict(v,value=str(float(v['value'])*3)) for v in rule['values']]
  for item in self.o['entries'].values():item['value']=str(float(item['value'])*3)
  self.o['level']=30;e=self.ev();self.assertEqual(e['value_score'],100);self.assertEqual(e['decision'],'锁定')
 def test_30_missing_table_is_review(self):
  self.o['level']=30;self.assertEqual(self.ev()['decision'],'跳过复核')
 def test_other_levels_not_extrapolated(self):
  self.o['level']=20;self.assertEqual(self.ev()['decision'],'跳过')
 def test_source_30_cells(self):
  m=import_workbook(next((Path(__file__).resolve().parent.parent/'心锚终端/表格').glob('*.xlsx')))
  r=m['rules'][0];self.assertEqual(r['values30'][0]['value'],'180');self.assertEqual(r['values30'][0]['source'],'D5')
  self.assertEqual(r['values'][0]['value'],'54');self.assertEqual(len(m['rules']),116)

if __name__=='__main__':
 suite=unittest.TestSuite(RevisedTests(n) for n in RevisedTests.__dict__ if n.startswith('test_'))
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 raise SystemExit(not result.wasSuccessful())
