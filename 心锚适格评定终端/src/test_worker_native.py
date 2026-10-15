"""Offline real worker lifecycle: bounded cancel and fresh restart, no controller."""
from pathlib import Path
import tempfile,threading,time,json
from ocr_worker import OCRWorker,OCRCancelled
ROOT=Path(__file__).resolve().parent.parent/'心锚终端'
w=OCRWorker(ROOT);stop=threading.Event()
with tempfile.TemporaryDirectory() as d:
 try:
  timer=threading.Timer(.05,stop.set);timer.start();start=time.perf_counter()
  try:w.request(ROOT/'示例截图/image10.png',Path(d)/'cancel.json',stop)
  except OCRCancelled:pass
  else:raise AssertionError('Cancellation not observed')
  assert time.perf_counter()-start<5 and w.proc is None
  stop.clear();w.request(ROOT/'示例截图/image10.png',Path(d)/'ok.json',stop)
  assert len(json.loads((Path(d)/'ok.json').read_text(encoding='utf-8')))==2
  pid=w.proc.pid
  w.request(ROOT/'示例截图/image10.png',Path(d)/'ok2.json',stop);assert w.proc.pid==pid
 finally:w.close()
print('Native worker cancel / restart / reuse passed; no game inputs.')
