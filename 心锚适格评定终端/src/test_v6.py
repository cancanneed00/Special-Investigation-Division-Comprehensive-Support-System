import unittest,tempfile,threading,json,shutil
from pathlib import Path
from unittest.mock import patch,Mock
from contextlib import ExitStack
import automation,vision
from test_batch import FakeBridge
from scoring import evaluate_dual
from ocr_worker import OCRWorker,OCRCancelled
HERE=Path(__file__).resolve().parent

class SpeedTests(unittest.TestCase):
 def test_real_two_and_three_stars(self):
  self.assertEqual(vision.rarity(vision.image(HERE/'reference/two-star.png')),2)
  for n in [1,3,4,5,6,7,8,9,10,11]:self.assertEqual(vision.rarity(vision.image(HERE/f'reference/image{n}.png')),3)
  self.assertIsNone(vision.rarity(vision.image(HERE/'reference/image2.png')))
 def test_uncertain_star_shape_not_skipped(self):
  im=vision.image(HERE/'reference/two-star.png');im.paste((0,0,0),(120,326,176,360))
  self.assertIsNone(vision.rarity(im))
 def test_two_star_scan_skips_ocr_and_mark_and_saves_evidence(self):
  with tempfile.TemporaryDirectory(dir=HERE) as root:
   b=FakeBridge(root,threading.Event());b.capture=lambda:HERE/'reference/two-star.png'
   rec=Mock();mark=Mock();rows=[]
   with ExitStack() as s:
    s.enter_context(patch('automation.time.sleep'))
    s.enter_context(patch('vision.grid_cells',return_value=[{'col':0,'y':153}]))
    s.enter_context(patch('vision.selected_cell',return_value=True))
    s.enter_context(patch('automation.mark_one',mark))
    automation.run_inventory(root,{}, {},None,b.stop,lambda r,n:rows.append(r),max_items=1,scroll=False,bridge_factory=lambda *a:b,recognizer=rec,apply_marks=True)
   rec.assert_not_called();mark.assert_not_called();self.assertEqual(rows[0]['action'],'二星跳过')
   self.assertTrue(Path(rows[0]['observation']['image']).is_file())
   self.assertEqual(json.loads((b.folder/'summary.json').read_text(encoding='utf-8'))['skipped_two_star'],1)
 def test_cancelled_worker_never_starts(self):
  w=OCRWorker(HERE);stop=threading.Event();stop.set()
  with patch.object(w,'start') as start:
   with self.assertRaises(OCRCancelled):w.request('x','y',stop)
   start.assert_not_called()
 def test_historical_two_star_remains_skipped(self):
  self.assertEqual(evaluate_dual({'anchors':{},'hash':'test'}, {'rarity':2})['decision'],'跳过')

if __name__=='__main__':unittest.main(verbosity=2)
