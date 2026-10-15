import unittest,tempfile,threading,json
from pathlib import Path
from unittest.mock import patch,Mock
import automation,vision

class FakeBridge:
 def __init__(self,root,stop):
  self.page=0;self.stop=stop;self.calls=[];self.folder=Path(root)/'run';self.folder.mkdir();self.closed=False
 def check(self):
  if self.stop.is_set():raise automation.Stopped()
 def capture(self):return self.page
 def guard(self,*args):return [{}]
 def rpc(self,op,**kw):
  self.check();self.calls.append((op,kw))
  if op=='scroll' and kw.get('direction')=='down':self.page=1
 def close(self):self.closed=True

class BatchTests(unittest.TestCase):
 def test_clipped_selected_row_preserves_continuity(self):
  folder=Path(__file__).resolve().parent/'reference'
  a=vision.image(folder/'page-before.png');b=vision.image(folder/'page-after.png')
  self.assertEqual(vision.selected_overlap(a,b,vision.grid_cells(a),vision.grid_cells(b)),0)
  self.assertIsNone(vision.selected_overlap(b,a,vision.grid_cells(b),vision.grid_cells(a)))
  # Without the persistent selected frame, identical artwork must not authorize continuation.
  with patch('vision.selected_cell',return_value=False):
   self.assertIsNone(vision.selected_overlap(a,b,vision.grid_cells(a),vision.grid_cells(b)))
 def test_waits_for_inertia_to_stop(self):
  b=Mock();b.capture.side_effect=range(5)
  with patch('automation.time.sleep'),patch('vision.image',side_effect=lambda p:p),patch('vision.row_signatures',return_value=[1]),patch('vision.overlap',return_value=-1),patch('vision.grid_cells',side_effect=[[{'y':y}] for y in [250,240,230,230,230]]):
   self.assertEqual(automation.wait_grid_still(b),4)
  self.assertEqual(b.capture.call_count,5)
 def test_moving_list_times_out_without_input(self):
  b=Mock()
  with patch('automation.time.sleep'),patch('vision.image'),patch('vision.row_signatures',return_value=[1]),patch('vision.overlap',return_value=-1),patch('vision.grid_cells',side_effect=[[{'y':y}] for y in range(200,215)]):
   with self.assertRaises(RuntimeError):automation.wait_grid_still(b)
  b.rpc.assert_not_called()
 def test_real_sort_arrows_and_dim_selection(self):
  folder=Path(__file__).resolve().parent/'reference'
  dim=vision.image(folder/'selected-dim.png');blank=vision.image(folder/'unselected.png')
  self.assertEqual(vision.level_order(dim),'low_first')
  self.assertEqual(vision.level_order(vision.image(folder/'image10.png')),'high_first')
  self.assertTrue(vision.selected_cell(dim,0,153))
  self.assertFalse(vision.selected_cell(blank,0,153))
  for c in vision.grid_cells(dim):
   if (c['col'],c['y'])!=(0,153):self.assertFalse(vision.selected_cell(dim,c['col'],c['y']))
 def test_sort_low_first_unchanged(self):
  b=Mock()
  with patch('vision.image'),patch('vision.level_order',return_value='low_first'):
   automation.prepare_level_order(b,Mock())
  b.rpc.assert_not_called()
 def test_sort_high_first_one_click(self):
  b=Mock()
  with patch('vision.image'),patch('vision.level_order',side_effect=['high_first','low_first']),patch('automation.time.sleep'):
   automation.prepare_level_order(b,Mock())
  self.assertEqual(b.rpc.call_count,1);self.assertEqual(b.rpc.call_args.args,('sort_level',))
 def test_sort_unknown_no_input(self):
  b=Mock()
  with patch('vision.image'),patch('vision.level_order',return_value='unknown'):
   with self.assertRaises(RuntimeError):automation.prepare_level_order(b,Mock())
  b.rpc.assert_not_called()
 def test_sort_failed_no_retry(self):
  b=Mock()
  with patch('vision.image'),patch('vision.level_order',return_value='high_first'),patch('automation.time.sleep'):
   with self.assertRaises(RuntimeError):automation.prepare_level_order(b,Mock())
  self.assertEqual(b.rpc.call_count,1)
 def run_case(self,apply=False,limit=100,overlap=None,stop=None,already_selected=False,level=1):
  with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as root:
   b=FakeBridge(root,stop or threading.Event());rows=[];progress=[]
   # Two columns and three rows per page; the second page overlaps by one row.
   cells=[{'col':c,'y':150+130*r} for r in range(3) for c in range(2)]
   patches=[patch('vision.rarity',return_value=None),patch('vision.selected_overlap',return_value=None),patch('vision.level_order',return_value='low_first'),patch('automation.time.sleep'),patch('vision.image',side_effect=lambda p:p),patch('vision.grid_cells',return_value=cells),
    patch('vision.row_signatures',side_effect=lambda im,c:[0,1,2] if im==0 else [2,3,4]),patch('vision.selected_cell',side_effect=[already_selected,True]*100),
    patch('vision.detail_same',return_value=True),patch('vision.overlap',side_effect=overlap or (lambda a,b:-1 if a==b else 1)),
    patch('automation.evaluate',return_value={'decision':'锁定'}),patch('automation.mark_one',return_value='锁定成功')]
   from contextlib import ExitStack
   with ExitStack() as stack:
    mocks=[stack.enter_context(p) for p in patches]
    result=automation.run_inventory(root,{}, {},None,b.stop,lambda r,n:rows.append(r),max_items=limit,
     bridge_factory=lambda *a:b,recognizer=lambda *a:{'anchor':'同名心锚','level':level},apply_marks=apply,progress=progress.append)
    marks=mocks[-1].call_count
   return result,b,rows,marks,progress
 def test_30_level_never_marks(self):
  r,b,rows,marks,_=self.run_case(apply=True,level=30)
  self.assertEqual(marks,0);self.assertTrue(all(x['evaluation']['decision']=='跳过' for x in rows))
 def test_full_scan_overlapping_pages(self):
  r,b,rows,marks,progress=self.run_case();self.assertEqual(r['count'],10);self.assertEqual(marks,0)
  self.assertEqual(sum(op=='select' for op,k in b.calls),10);self.assertTrue(b.closed)
  self.assertEqual([k['direction'] for op,k in b.calls[:3]],['up']*3);self.assertTrue(progress)
 def test_marking_processes_every_item(self):self.assertEqual(self.run_case(True)[3],10)
 def test_selected_card_not_toggled_off(self):
  r,b,*_=self.run_case(already_selected=True);self.assertEqual(r['count'],10);self.assertFalse(any(op=='select' for op,k in b.calls))
 def test_limit_does_not_extra_scroll(self):
  r,b,*_=self.run_case(limit=2);self.assertEqual(r['count'],2);self.assertFalse(any(k.get('direction')=='down' for op,k in b.calls))
 def test_ambiguous_overlap_stops(self):
  r,b,*_=self.run_case(overlap=lambda a,b:-1 if a==b else None);self.assertEqual(r['count'],6);self.assertIn('无法唯一确认',r['reason'])
 def test_cancel_before_any_input(self):
  stop=threading.Event();stop.set();r,b,*_=self.run_case(stop=stop);self.assertEqual(r['count'],0);self.assertEqual(b.calls,[])
 def test_one_card_last_row_detected(self):
  from PIL import Image
  im=Image.new('RGB',(1280,720),'black')
  for y in range(638,642):
   for x in range(580,686):im.putpixel((x,y),(50,100,220))
  cells=vision.grid_cells(im);self.assertEqual(len(cells),1);self.assertEqual(cells[0]['col'],0);self.assertGreater(cells[0]['y'],585)
 def test_small_scroll_is_not_stationary(self):
  self.assertFalse(vision.same_row_positions([{'y':200},{'y':330}],[{'y':180},{'y':310}]))
  self.assertTrue(vision.same_row_positions([{'y':200},{'y':330}],[{'y':201},{'y':331}]))

if __name__=='__main__':unittest.main(verbosity=2)
