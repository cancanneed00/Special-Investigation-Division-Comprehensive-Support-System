import unittest,tempfile,json,csv
from pathlib import Path
from unittest.mock import Mock
import history

class CombinedTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
 def tearDown(self):self.tmp.cleanup()
 def run_part(self,key,n,parent=None):
  folder=self.root/'数据/整理记录'/(key*32);folder.mkdir(parents=True)
  rows=[{'observation':{'anchor':'同名心锚','image':str(folder/f'{i}.png')},'evaluation':{'value_score':0,'value_range':None,'match_score':0,'decision':'跳过','matches':[],'reasons':[]},'action':'未标记'} for i in range(n)]
  history.atomic_json(folder/'results.json',rows)
  if parent:history.atomic_json(folder/'continuation.json',{'folder':str(parent)})
  return folder,rows
 def test_three_segments_keep_distinct_identical_items(self):
  a,_=self.run_part('a',2);b,_=self.run_part('b',3,a);c,_=self.run_part('c',1,b)
  rows=history.combined_records(self.root,c)
  self.assertEqual(len(rows),6);self.assertEqual([r['origin_run'][0] for r in rows],list('aabbbc'))
 def test_failed_zero_item_resume_still_shows_all(self):
  a,_=self.run_part('a',2);b,_=self.run_part('b',0,a)
  self.assertEqual(len(history.combined_records(self.root,b)),2)
 def test_checkpoint_link_recovers_interrupted_run(self):
  a,_=self.run_part('a',2);b,_=self.run_part('b',1)
  history.atomic_json(b/'checkpoint.json',{'parent':{'folder':str(a)}})
  self.assertEqual(len(history.combined_records(self.root,b)),3)
 def test_missing_parent_or_cycle_report_error(self):
  a,_=self.run_part('a',1)
  history.atomic_json(a/'continuation.json',{'folder':str(a)})
  with self.assertRaises(ValueError):history.combined_records(self.root,a)
  history.atomic_json(a/'continuation.json',{'folder':str(a.parent/('b'*32))})
  with self.assertRaises(ValueError):history.combined_records(self.root,a)
 def test_archive_csv_contains_complete_chain_without_image_duplication(self):
  a,ra=self.run_part('a',2);history.archive(self.root,a,ra)
  b,rb=self.run_part('b',1,a);dest=history.archive(self.root,b,rb)
  self.assertEqual(len(json.loads((dest/'results.json').read_text())),1)
  self.assertEqual(json.loads((dest/'summary.json').read_text())['total_count'],3)
  with (dest/'结果摘要.csv').open(encoding='utf-8-sig',newline='') as stream:rows=list(csv.reader(stream))
  self.assertEqual([r[0] for r in rows[1:]],['1','2','3']);self.assertEqual(rows[1][2],'0')
  self.assertIn('a'*32,rows[1][-1]);self.assertEqual(len(history.combined_records(self.root,b)),3)
 def test_restore_list_drains_stale_events_and_preserves_old_rows(self):
  import queue
  from desktop import App
  a=Mock();a.events=queue.Queue();a.events.put(('old',1));a.history.get_children.return_value=[]
  _,rows=self.run_part('a',2)
  for row in rows:row['evaluation'].update(value_details=[],eligible_matches=[])
  App.restore_scan_results(a,rows)
  self.assertEqual(len(a.batch_records),2);self.assertTrue(a.events.empty())
  self.assertEqual(a.history.insert.call_count,2)
  self.assertEqual([c.kwargs['values'][0] for c in a.history.insert.call_args_list],[1,2])

if __name__=='__main__':unittest.main(verbosity=2)
