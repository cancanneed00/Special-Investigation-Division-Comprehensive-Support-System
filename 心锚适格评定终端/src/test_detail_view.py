import unittest
from detail_view import recommendation_rows,score_range

class DetailTests(unittest.TestCase):
 def test_eligible_alternative_selected_before_highest_score(self):
  e={'eligible_matches':[{'character':'乙','rank':2}], 'matches':[
   {'character':'甲','score':100,'rank':1,'gate_pass':False},
   {'character':'乙','score':99,'alternatives':[{'rank':1,'score':99,'gate_pass':False},{'rank':2,'score':85,'gate_pass':True}]}]}
  rows=recommendation_rows(e)
  self.assertEqual(rows[0]['match']['character'],'乙');self.assertEqual(rows[0]['default'],1)
  self.assertEqual(rows[1]['status'],'未达标')
 def test_gate_pass_alone_does_not_claim_retention(self):
  e={'matches':[{'character':'甲','rank':1,'score':50,'gate_pass':True}]}
  self.assertFalse(recommendation_rows(e)[0]['eligible'])
 def test_empty_and_ranges(self):
  self.assertEqual(recommendation_rows({}),[])
  self.assertEqual(score_range([100,100]),'100');self.assertEqual(score_range([80,90]),'80 — 90')

if __name__=='__main__':unittest.main(verbosity=2)
