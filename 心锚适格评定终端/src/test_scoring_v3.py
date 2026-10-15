import copy,unittest
from scoring import DEFAULT_POLICY,evaluate_dual,validate_policy,tier_evidence,tier_pass
from engine import parse_entry,import_workbook
from pathlib import Path
from openpyxl import Workbook

class ScoringRulesTests(unittest.TestCase):
 def setUp(self):
  self.p=copy.deepcopy(DEFAULT_POLICY)
  self.p['keep']['perfect_enabled']=False # Isolate recommendation gates.
  self.o={'anchor':'测试','level':1,'issues':[],'entries':{},'traits':{'1':'核心2','2':'辅助1'},'presence':{},'trait_presence':{}}
  self.m={'hash':'fixture','anchors':{'测试':{'name':'测试','slot':1,'pools':{},'traits':{'1':['核心2','其他2'],'2':['辅助1']}}},'rules':[],'characters':[]}
  entries=[]
  for i,stat in enumerate(['攻击','暴击','生命','免伤'],1):
   key=str(i);self.m['anchors']['测试']['pools'][key]=[stat]
   vals=[100,90,80,70,60,50] if i<4 else [10]
   self.m['rules'].append({'slot':1,'pos':i,'stat':stat,'unit':'flat','variant':stat,'values':[{'tier':n+1,'value':str(v),'source':'A1'} for n,v in enumerate(vals)]})
   self.o['entries'][key]={'stat':stat,'value':str(vals[0]),'unit':'flat','star':True};self.o['presence'][key]='present'
   entries.append({'kind':'entry','idx':i,'tokens':[{'t':stat,'others':False,'bold':i<3,'red':False,'direction':'max'}],'ops':[],'raw':stat,'source':'A1','all_equal':i==4})
  entries.append({'kind':'trait','idx':1,'tokens':[{'t':'核心2','others':False,'bold':True,'red':True,'direction':'max'}],'ops':[],'raw':'核心2','source':'A2','all_equal':False})
  self.m['characters']=[{'name':'甲','note':'','recs':[{'active':True,'anchor':'测试','slot':1,'rank':1,'entries':entries}]}]
 def ev(self):return evaluate_dual(self.m,self.o,policy=self.p)
 def value(self,key,n):self.o['entries'][str(key)].update(value=str([100,90,80,70,60,50][n-1]),star=n==1)
 def missing(self,key):self.o['entries'][str(key)]=None;self.o['presence'][str(key)]='absent'
 def test_important_second_passes(self):
  self.value(1,2);self.assertEqual(self.ev()['decision'],'锁定')
 def test_important_third_blocks_even_match_100(self):
  self.value(1,3);r=self.ev();self.assertEqual(r['match_score'],100);self.assertEqual(r['decision'],'跳过')
 def test_ordinary_third_passes(self):
  self.value(3,3);self.assertEqual(self.ev()['decision'],'锁定')
 def test_ordinary_fourth_to_sixth_blocks_but_not_discard(self):
  for tier in [4,5,6]:
   self.value(3,tier);self.assertEqual(self.ev()['decision'],'跳过')
 def test_any_stat_obeys_third_tier(self):
  self.m['characters'][0]['recs'][0]['entries'][2]['all_equal']=True
  self.value(3,3);self.assertEqual(self.ev()['decision'],'锁定')
  self.value(3,4);self.assertEqual(self.ev()['decision'],'跳过')
 def test_explicit_unimportant_overrides_bold(self):
  self.m['characters'][0]['recs'][0]['entries'][2]['tokens'][0].update(bold=True,unimportant=True)
  self.value(3,3);self.assertEqual(self.ev()['decision'],'锁定')
  self.value(3,4);self.assertEqual(self.ev()['decision'],'跳过')
 def test_two_full_entries_discard(self):
  self.missing(3);self.missing(4);r=self.ev();self.assertAlmostEqual(r['value_score'],66.67);self.assertEqual(r['decision'],'标记放弃')
 def test_three_full_entries_keep(self):
  self.missing(4);r=self.ev();self.assertEqual(r['value_score'],100);self.assertEqual(r['decision'],'锁定')
 def test_all_fourth_or_lower_discard(self):
  self.missing(4)
  for i in [1,2,3]:self.value(i,4)
  self.assertEqual(self.ev()['decision'],'标记放弃')
 def test_single_third_prevents_all_low_discard(self):
  self.p['discard'].update(joint_enabled=False,weak_enabled=False) # Isolate the all-low rule.
  self.missing(4)
  for i in [1,2,3]:self.value(i,4)
  self.value(1,3);self.assertEqual(self.ev()['decision'],'跳过')
 def test_fourth_existing_counts_as_first_tier(self):
  for i in [1,2,3]:self.value(i,5)
  self.assertFalse(self.ev()['quality_filter']['bad'])
 def test_min_bottom_two_passes_top_fails(self):
  self.m['characters'][0]['recs'][0]['entries'][2]['tokens'][0]['direction']='min'
  for tier in [5,6]:self.value(3,tier);self.assertEqual(self.ev()['decision'],'锁定')
  for tier in [1,2,3,4]:self.value(3,tier);self.assertEqual(self.ev()['decision'],'跳过')
 def test_min_does_not_reverse_independent_quality_score(self):
  self.m['characters'][0]['recs'][0]['entries'][2]['tokens'][0]['direction']='min'
  a=self.ev();self.value(3,6);b=self.ev();self.assertGreater(a['value_score'],b['value_score']);self.assertEqual(a['match_score'],b['match_score'])
 def test_traits_are_annotations_only(self):
  before=self.ev();self.o['traits']['1']='其他2';after=self.ev();self.assertEqual(after['decision'],'锁定');self.assertEqual(before['match_score'],after['match_score'])
 def test_low_affinity_alone_never_discards(self):
  self.m['characters']=[];self.assertEqual(self.ev()['decision'],'跳过')
 def test_unknown_absence_blocks_marks(self):
  self.missing(4);self.o['presence']['4']='unknown';self.assertEqual(self.ev()['decision'],'跳过复核')
 def test_between_first_second_can_pass(self):
  self.o['entries']['1'].update(value='95',star=False);self.assertEqual(self.ev()['decision'],'锁定')
 def test_between_second_third_needs_review(self):
  self.o['entries']['1'].update(value='85',star=False);self.assertEqual(self.ev()['decision'],'跳过复核')
 def test_between_third_fourth_not_automatically_discard(self):
  self.missing(4)
  for i in [1,2,3]:self.value(i,4)
  self.o['entries']['1']['value']='75';self.assertEqual(self.ev()['decision'],'跳过复核')
 def test_same_character_alternative_can_keep(self):
  rec=copy.deepcopy(self.m['characters'][0]['recs'][0]);rec['rank']=2
  rec['entries'][0]['tokens'][0]['bold']=False
  self.m['characters'][0]['recs'].append(rec);self.value(1,3)
  r=self.ev();self.assertEqual(r['decision'],'锁定');self.assertEqual(r['eligible_matches'][0]['rank'],2)
 def test_another_character_can_keep(self):
  ch=copy.deepcopy(self.m['characters'][0]);ch['name']='乙';ch['recs'][0]['entries'][0]['tokens'][0]['bold']=False
  self.m['characters'].append(ch);self.value(1,3);self.assertEqual(self.ev()['decision'],'锁定')
 def test_note_lower_hp_is_min(self):
  self.m['characters'][0]['note']='生命词条越低越好';self.value(3,6);self.assertEqual(self.ev()['decision'],'锁定')
 def test_note_relaxed_crit_uses_third(self):
  self.m['characters'][0]['note']='自身暴击加成极高，对暴击词条可放低要求';self.value(2,3);self.assertEqual(self.ev()['decision'],'锁定')
 def test_disabled_rules_no_action(self):
  self.p['keep']['enabled']=self.p['discard']['enabled']=False;self.assertEqual(self.ev()['decision'],'跳过')
 def test_old_any_policy_migrates_to_new_gates(self):
  self.p={'keep':{'value_enabled':True,'match_enabled':True,'match_threshold':80,'join':'any'},'discard':{'value_enabled':True,'match_enabled':True,'join':'all'}}
  self.value(1,3);self.assertEqual(self.ev()['decision'],'跳过');self.assertEqual(validate_policy(self.p)['version'],2)
 def test_invalid_settings(self):
  for key,v in [('max_tier',3),('ordinary_tier',4),('match_threshold',float('nan')),('min_bottom_tiers',0)]:
   p=copy.deepcopy(self.p);p['keep'][key]=v
   with self.assertRaises(ValueError):validate_policy(p)
 def test_parser_fullwidth_min_and_unimportant(self):
  w=Workbook();c=w.active['A1'];c.value='生命（MIN!）';self.assertEqual(parse_entry(c,'entry',1)['tokens'][0]['direction'],'min')
  c.value='生命（不重要）';e=parse_entry(c,'entry',1);self.assertTrue(e['tokens'][0]['unimportant']);self.assertEqual(e['tokens'][0]['t'],'生命')

if __name__=='__main__':unittest.main(verbosity=2)
