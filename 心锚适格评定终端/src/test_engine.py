import sys,json,unittest,tempfile,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from engine import Store,import_workbook,classify,evaluate,parse_ocr,recognize
ROOT=Path(__file__).resolve().parent.parent
if ROOT.name=='心锚终端':PACKAGE=ROOT
else:PACKAGE=ROOT/'心锚终端'
BOOK=next((PACKAGE/'表格').glob('*.xlsx'))

class EngineTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.m=import_workbook(BOOK)
 def test_import(self):
  # The shipped workbook is maintained externally, so absolute row counts move
  # with each data drop (0.6.9 shipped 41 characters / 48 anchors). Assert a
  # coherent structure at or above the baseline instead of an exact snapshot.
  counts=(len(self.m['characters']),len(self.m['anchors']),len(self.m['rules']))
  self.assertTrue(counts[0]>=40 and counts[1]>=47 and counts[2]>0,counts)
  self.assertTrue(any('3.1.2' in x for x in self.m['warnings']))
 def test_min_normalized(self):
  es=[e for c in self.m['characters'] for r in c['recs'] for e in r['entries'] if any(t['direction']=='min' for t in e['tokens'])]
  self.assertEqual(len(es),4);self.assertTrue(all('(' not in e['tokens'][0]['t'] for e in es))
 def test_duplicate_id_preserved(self):self.assertTrue({80,81}.issubset({r['id'] for r in self.m['rules']}))
 def test_ambiguity(self):
  self.assertEqual(classify(self.m,3,1,'护甲',34,'flat')['state'],'review')
  self.assertEqual(classify(self.m,3,1,'护甲',34,'flat',True)['tiers'],[1])
 def test_tolerance(self):
  self.assertEqual(classify(self.m,1,4,'异能伤害','1.00','percent')['tiers'],[1])
  self.assertEqual(classify(self.m,1,4,'异能伤害','.94','percent')['state'],'review')
 def test_units(self):self.assertEqual(classify(self.m,1,1,'攻击','5.63','percent')['state'],'review')
 def test_integer_tie(self):self.assertEqual(classify(self.m,3,3,'抗性穿透',10,'flat')['tiers'],[1,2])
 def test_nonfinite(self):self.assertEqual(classify(self.m,1,1,'攻击','NaN','flat')['state'],'review')
 def test_cache_atomic(self):
  with tempfile.TemporaryDirectory(dir=ROOT) as d:
   s=Store(d);a,changed=s.load(BOOK);self.assertTrue(changed)
   b,changed=s.load(BOOK);self.assertFalse(changed);self.assertEqual(a['hash'],b['hash'])
   bad=Path(d)/'bad.xlsx';bad.write_bytes(b'bad')
   with self.assertRaises(Exception):s.load(bad)
   self.assertEqual(s.cached()['hash'],a['hash'])
 def observation(self):return {'anchor':'头狼金雕','level':1,'entries':{'1':{'stat':'攻击','value':'54','unit':'flat'},'2':{'stat':'暴击','value':'4.23','unit':'percent'},'3':{'stat':'护甲穿透%','value':'2.63','unit':'percent'},'4':{'stat':'物质伤害','value':'.99','unit':'percent'}},'traits':{'1':'惯性冲击2','2':'集中1'},'issues':[]}
 def test_unimportant_low_allowed(self):
  r=evaluate(self.m,self.observation(),['犬齿']);self.assertEqual(r['decision'],'建议锁定');self.assertEqual(r['matches'][0]['score'],97.08)
 def test_important_low_rejected(self):
  o=self.observation();o['entries']['2']['value']='3.96';self.assertEqual(evaluate(self.m,o,['犬齿'])['decision'],'建议放弃')
 def test_missing_fourth(self):
  o=self.observation();o['entries']['4']=None;self.assertEqual(evaluate(self.m,o,['犬齿'])['decision'],'建议放弃')
 def test_unknown_stat_review(self):
  o=self.observation();o['entries']['3']['stat']='随意';self.assertEqual(evaluate(self.m,o,['犬齿'])['decision'],'待复核')
 def test_red_trait(self):
  o=self.observation();o['traits']['2']='巨人杀手1';self.assertEqual(evaluate(self.m,o,['犬齿'])['decision'],'建议放弃')
 def test_ocr_issue(self):
  o=self.observation();o['issues']=['低置信'];self.assertEqual(evaluate(self.m,o,['犬齿'])['decision'],'待复核')
 def test_non_level_one(self):
  o=self.observation();o['level']=30;self.assertEqual(evaluate(self.m,o)['decision'],'跳过')
 def test_no_recommendation_review(self):self.assertEqual(evaluate(self.m,self.observation(),['不存在'])['decision'],'待复核')
 def test_threshold(self):self.assertEqual(evaluate(self.m,self.observation(),['犬齿'],99)['decision'],'建议放弃')

if __name__=='__main__':
 if '--ocr' in sys.argv:
  m=import_workbook(BOOK);results=[]
  for name,expected in [('image1.png','苍炎狼徽'),('image10.png','头狼金雕')]:
   obs=recognize(PACKAGE,PACKAGE/'示例截图'/name,m);ev=evaluate(m,obs)
   results.append({'file':name,'observation':obs,'evaluation':ev})
   print(json.dumps({'file':name,'anchor':obs['anchor'],'level':obs['level'],'entries':obs['entries'],'traits':obs['traits'],'issues':obs['issues'],'decision':ev['decision']},ensure_ascii=False),flush=True)
   assert obs['anchor']==expected and obs['level']==1
   assert all(obs['entries'].values())
   expected_stats=['攻击','暴击伤害','技能威力','异能伤害'] if name=='image1.png' else ['攻击','暴击','护甲穿透%','异能伤害']
   expected_vals=['54','3.96','2.00','1.00'] if name=='image1.png' else ['54','4.23','2.63','0.99']
   assert [obs['entries'][str(i)]['stat'] for i in range(1,5)]==expected_stats
   assert [obs['entries'][str(i)]['value'] for i in range(1,5)]==expected_vals
   assert obs['traits']==({'1':'噬魂炎2','2':'泥沼1'} if name=='image1.png' else {'1':'惯性冲击2','2':'集中1'})
   assert not obs['issues']
  (PACKAGE/'OCR实测.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 else:unittest.main()
