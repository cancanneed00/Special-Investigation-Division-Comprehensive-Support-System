import unittest,threading,tempfile
from pathlib import Path
from unittest.mock import Mock,patch
from PIL import Image
import vision,automation

class NavigationTests(unittest.TestCase):
 def test_selected_marker_tolerates_animated_art(self):
  root=Path(__file__).parent/'reference';a=vision.image(root/'page-before.png');b=vision.image(root/'page-after.png')
  ca=vision.grid_cells(a);cb=vision.grid_cells(b)
  with patch('vision.rows_equal',return_value=False):self.assertEqual(vision.selected_overlap(a,b,ca,cb),0)
 def test_changed_detail_cannot_authorize_overlap(self):
  root=Path(__file__).parent/'reference';a=vision.image(root/'page-before.png');b=vision.image(root/'page-after.png')
  ca=vision.grid_cells(a);cb=vision.grid_cells(b)
  with patch('vision.detail_same',return_value=False):self.assertIsNone(vision.selected_overlap(a,b,ca,cb))
 def test_recovery_only_navigates_and_stops_on_success(self):
  b=Mock()
  with patch('automation.wait_grid_still',return_value='next'),patch('vision.image'),patch('vision.grid_cells'),patch('vision.selected_overlap',side_effect=[None,2]):
   self.assertEqual(automation.recover_overlap(b,None,[], 'old',Mock()),(2,'next'))
  self.assertEqual(b.rpc.call_count,2)
  for c in b.rpc.call_args_list:self.assertEqual(c.args,('scroll',));self.assertEqual(c.kwargs['direction'],'up');self.assertTrue(c.kwargs['precise'])
 def test_recovery_is_bounded(self):
  b=Mock()
  with patch('automation.wait_grid_still',return_value='next'),patch('vision.image'),patch('vision.grid_cells'),patch('vision.selected_overlap',return_value=None):
   self.assertIsNone(automation.recover_overlap(b,None,[],'old',Mock())[0])
  self.assertEqual(b.rpc.call_count,3)
 def test_stop_prevents_recovery_input(self):
  b=Mock();b.check.side_effect=automation.Stopped()
  with self.assertRaises(automation.Stopped):automation.recover_overlap(b,None,[],'old',Mock())
  b.rpc.assert_not_called()
 def test_diagnostic_pair_saved(self):
  with tempfile.TemporaryDirectory() as folder:
   b=Mock();b.folder=Path(folder);im=Image.new('RGB',(1280,720))
   automation.save_navigation_failure(b,im,im,[],[],20)
   self.assertTrue((b.folder/'navigation.json').is_file());self.assertEqual(len(list(b.folder.glob('navigation-*.png'))),2)

if __name__=='__main__':unittest.main(verbosity=2)
