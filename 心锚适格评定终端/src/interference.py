"""Tolerance for external pointer nudges during warehouse processing.

The input driver moves the physical cursor (MaaFramework Seize mode), so the
position recorded right after each driver action is the expected state. A nudge
from the user leaves the cursor somewhere else, and the vision checks that
follow can fail before anything is actually wrong with the game. This module
keeps that expected snapshot so the scan loop can tell an external nudge apart
from its own movement, wait it out, re-check, and repair once before giving up.

No clicking lives here. Reading the cursor and restoring the snapshot are the
only operations; every repair re-uses the existing whitelisted Bridge RPC.

Reading the cursor is defensive: GetCursorPos blocks in some isolated sessions
(sandboxes, GUI-less shells) instead of failing, so every read runs on a daemon
thread with a short budget. After a few consecutive timeouts the module goes
quiet and reports 'unknown' forever, which degrades to the caller's strict
behaviour rather than hanging the scan.
"""
import ctypes, threading


class Pointer:
    """Windows cursor snapshot with a small tolerance, in physical pixels.

    Query results are None ('unknown') when the cursor cannot be read, so
    callers fall back to their strict behaviour instead of guessing."""
    def __init__(self, tolerance=6, budget=0.05, misses_allowed=3):
        self.tolerance=tolerance;self.expected=None
        self._budget=budget;self._misses=0;self._misses_allowed=misses_allowed;self._dead=False
        try:
            self._user32=ctypes.windll.user32
            class POINT(ctypes.Structure):
                _fields_=[('x',ctypes.c_long),('y',ctypes.c_long)]
            self._point=POINT
        except Exception:self._user32=None;self._point=None
    def pos(self):
        if not self._user32 or self._dead:return None
        point=self._point();done=threading.Event()
        def read(pt):
            try:self._user32.GetCursorPos(ctypes.byref(pt))
            except Exception:pass
            finally:done.set()
        worker=threading.Thread(target=read,args=(point,),daemon=True)
        worker.start()
        if not done.wait(self._budget):
            # The call is stuck; a few of these and cursor tracking goes quiet.
            self._misses+=1
            if self._misses>=self._misses_allowed:self._dead=True
            return None
        self._misses=0
        return (point.x,point.y)
    def commit(self,pos=None):
        # Called after driver actions: the driver's own motion is expected motion.
        self.expected=pos if pos is not None else self.pos()
    def displaced(self):
        now=self.pos();expected=self.expected
        if now is None or expected is None:return None
        return abs(now[0]-expected[0])>self.tolerance or abs(now[1]-expected[1])>self.tolerance
    def describe(self):
        state=self.displaced()
        if state is None:return '无法读取光标'
        return '指针疑似被移动' if state else '指针位置正常'


# One warehouse run at a time (enforced by the automation lock in run_inventory),
# and Bridge.rpc needs to reach the snapshot without being handed an object.
POINTER=Pointer()
