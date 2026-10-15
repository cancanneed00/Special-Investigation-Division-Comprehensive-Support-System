import unittest,tempfile,json,threading
from pathlib import Path
from unittest.mock import patch,Mock
from PIL import Image
import vision,automation,resume_scan
from test_batch import FakeBridge
HERE=Path(__file__).resolve().parent

class ResumeTests(unittest.TestCase):
 def setUp(self):
  self.before=vision.image(HERE/'reference/overlap-selected-before.png')
  self.after=vision.image(HERE/'reference/overlap-selected-after.png')
  self.state={'frame':str(HERE/'reference/overlap-selected-before.png'),'cell':{'col':4,'y':588}}
 def test_actual_failure_now_has_full_selected_row(self):
  cells=vision.grid_cells(self.before)
  self.assertEqual([c['col'] for c in cells if c['y']==588],list(range(5)))
  self.assertEqual(vision.selected_overlap(self.before,self.after,cells,vision.grid_cells(self.after)),2)
 def test_resume_from_actual_failure_after_last_item(self):
  anchor=resume_scan.selected_boundary(self.after,self.state)
  cells=resume_scan.remaining_cells(vision.grid_cells(self.after),anchor,False)
  self.assertEqual([(c['col'],c['y']) for c in cells],[(c,474) for c in range(5)])
 def test_manual_includes_selected_item(self):
  anchor=resume_scan.selected_boundary(self.after,self.state,True)
  cells=resume_scan.remaining_cells(vision.grid_cells(self.after),anchor,True)
  self.assertEqual((cells[0]['col'],cells[0]['y']),(4,344));self.assertEqual(len(cells),6)
 def test_different_detail_blocks_auto_but_manual_can_choose(self):
  altered=self.after.copy();altered.paste((255,0,0),(345,63,535,101))
  with self.assertRaises(RuntimeError):resume_scan.selected_boundary(altered,self.state)
  self.assertEqual(resume_scan.selected_boundary(altered,self.state,True)['col'],4)
 def test_changed_sort_or_count_blocks_auto(self):
  altered=self.after.copy();altered.paste((255,255,255),(565,655,698,692))
  with self.assertRaises(RuntimeError):resume_scan.selected_boundary(altered,self.state)
 def test_missing_selection_does_not_resume(self):
  with patch('vision.selected_cell',return_value=False):
   with self.assertRaises(RuntimeError):resume_scan.selected_boundary(self.after,self.state,True)
 def test_checkpoint_survives_restart(self):
  with tempfile.TemporaryDirectory(dir=HERE) as root:
   run=Path(root)/'数据/整理记录'/('a'*32);run.mkdir(parents=True)
   bridge=Mock();bridge.folder=run
   record={'cell':{'col':4,'y':588},'observation':{'anchor':'测试','image':str(run/'checkpoint.png')},'evaluation':{}}
   (run/'results.json').write_text(json.dumps([record]),encoding='utf-8')
   resume_scan.save_checkpoint(bridge,self.before,record['cell'],1,{'saved':'policy'},['探员'],False,{'total_before':175})
   state=resume_scan.latest_checkpoint(root)
   self.assertEqual(state['total_before'],176);self.assertFalse(state['apply_marks']);self.assertEqual(state['selected'],['探员'])
   self.assertEqual(resume_scan.selected_boundary(self.after,state)['col'],4)
 def test_resume_scan_does_not_rewind_or_sort_or_repeat_completed_cell(self):
  with tempfile.TemporaryDirectory(dir=HERE) as root:
   b=FakeBridge(root,threading.Event());b.capture=lambda:HERE/'reference/overlap-selected-after.png'
   cells=vision.grid_cells(self.after);s=dict(self.state,folder='previous',count=175,total_before=175,apply_marks=False,manual=False)
   with patch('automation.time.sleep'),patch('automation.prepare_level_order') as sort,patch('automation.rewind_inventory') as rewind,patch('vision.rarity',return_value=None),patch('vision.selected_cell',return_value=True),patch('resume_scan.selected_boundary',return_value={'col':4,'y':344}),patch('automation.evaluate',return_value={'decision':'锁定'}):
    rows=[];result=automation.run_inventory(root,{}, {},None,b.stop,lambda r,n:rows.append(r),scroll=False,max_items=1,bridge_factory=lambda *a:b,recognizer=lambda *a:{'anchor':'测试','level':1},resume=s)
   sort.assert_not_called();rewind.assert_not_called();self.assertEqual(result['count'],1)
   self.assertEqual(rows[0]['cell']['col'],0);self.assertEqual(rows[0]['cell']['y'],474)
   self.assertEqual(rows[0]['action'],'仅评分：锁定')

if __name__=='__main__':unittest.main(verbosity=2)
