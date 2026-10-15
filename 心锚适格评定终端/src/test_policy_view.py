import copy, unittest
from policy_view import simulate
from scoring import DEFAULT_POLICY

class SimulatorTests(unittest.TestCase):
 def trial(self,q=90,m=85,n=3,tiers=(2,2,3,1),roles=('重要','重要','普通','普通'),p=None,unknown=False):
  return simulate(p or DEFAULT_POLICY,q,m,n,tiers,roles,unknown)[0]
 def test_presets_and_boundaries(self):
  self.assertEqual(self.trial(),'锁定')
  self.assertEqual(self.trial(q=96,m=50),'锁定')
  self.assertEqual(self.trial(q=95,m=50),'跳过')
  self.assertEqual(self.trial(q=94.99,m=50),'标记放弃')
  self.assertEqual(self.trial(q=85,m=70),'跳过')
  self.assertEqual(self.trial(q=84.99,m=70),'标记放弃')
 def test_min_and_ordinary(self):
  self.assertEqual(self.trial(q=75,tiers=(6,2,3,1),roles=('min','重要','普通','普通')),'锁定')
  self.assertEqual(self.trial(q=90,tiers=(2,2,4,1)),'跳过')
  self.assertEqual(self.trial(q=80,tiers=(4,5,6,1)),'标记放弃')
 def test_priority_and_unknown(self):
  self.assertEqual(self.trial(q=99,n=2),'标记放弃')
  self.assertEqual(self.trial(q=99,n=2,unknown=True),'跳过复核')
 def test_switches(self):
  p=copy.deepcopy(DEFAULT_POLICY);p['discard']['enabled']=False
  self.assertEqual(self.trial(q=80,m=50,p=p),'跳过')
  p=copy.deepcopy(DEFAULT_POLICY);p['keep']['enabled']=False
  self.assertEqual(self.trial(q=75,tiers=(6,2,3,1),roles=('min','重要','普通','普通'),p=p),'跳过')
  p['keep']['perfect_enabled']=False
  self.assertEqual(self.trial(q=99,m=50,p=p),'跳过')
 def test_invalid(self):
  for q in ('nan',101,-1):
   with self.assertRaises(ValueError):self.trial(q=q)

class EditorTests(unittest.TestCase):
 def test_build_and_restore(self):
  import tkinter as tk
  from tkinter import ttk
  from types import SimpleNamespace
  from pathlib import Path
  import tempfile
  from policy_view import build_policy
  from scoring import validate_policy
  root=tk.Tk();root.withdraw()
  try:
   with tempfile.TemporaryDirectory() as tmp:
    page=ttk.Frame(root);page.pack(fill='both',expand=True)
    a=SimpleNamespace(rulespage=page,store=SimpleNamespace(config=Path(tmp)/'config.json'),status=tk.StringVar(),save_policy=lambda:None)
    a.policy=lambda:validate_policy({'version':2,**{k:{n:v.get() for n,v in group.items()} for k,group in a.policyvars.items()}})
    build_policy(a);root.update_idletasks()
    self.assertEqual(a.policy(),validate_policy(DEFAULT_POLICY))
    a.policyvars['keep']['match_threshold'].set('70');root.update_idletasks()
    self.assertEqual(a.policy()['keep']['match_threshold'],70)
    import ui_v4
    ui_v4.reset_policy(a)
    self.assertEqual(a.policy(),validate_policy(DEFAULT_POLICY))
    notebook=next(w for w in page.winfo_children() if isinstance(w,ttk.Notebook))
    self.assertEqual(len(notebook.tabs()),3)
  finally:root.destroy()

if __name__=='__main__':unittest.main()
