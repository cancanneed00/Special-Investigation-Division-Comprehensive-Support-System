"""One serialized CPU OCR worker per application, with bounded waits and cancellation."""
import atexit,json,queue,subprocess,threading,time
from pathlib import Path

class OCRCancelled(RuntimeError):pass

class OCRWorker:
 def __init__(self,root):
  self.root=Path(root);self.lock=threading.Lock();self.proc=None;self.serial=0
 def start(self):
  app=self.root/'程序文件';self.responses=queue.Queue();responses=self.responses
  self.proc=subprocess.Popen([str(app/'runtime/node.exe'),str(app/'ocr.js'),'--server'],cwd=app,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  proc=self.proc
  def pump():
   for line in proc.stdout:
    try:responses.put(json.loads(line))
    except (ValueError,TypeError):pass
  threading.Thread(target=pump,daemon=True).start()
 def close(self):
  proc=self.proc;self.proc=None
  if proc:
   try:proc.stdin.close();proc.wait(timeout=1)
   except Exception:proc.kill();proc.wait(timeout=5)
   finally:
    if proc.stdout:proc.stdout.close()
 def request(self,input_path,output_path,stop=None):
  with self.lock:
   if stop is not None and stop.is_set():raise OCRCancelled('OCR已停止')
   if self.proc is None or self.proc.poll() is not None:self.close();self.start()
   self.serial+=1
   try:
    self.proc.stdin.write(json.dumps({'id':self.serial,'input':str(input_path),'output':str(output_path)},ensure_ascii=False)+'\n');self.proc.stdin.flush()
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
     if stop is not None and stop.is_set():raise OCRCancelled('OCR已停止')
     if self.proc.poll() is not None:raise RuntimeError('OCR进程退出，可重新识别；未进行游戏标记')
     try:r=self.responses.get(timeout=.1)
     except queue.Empty:continue
     if r.get('id')!=self.serial:continue
     if not r.get('ok'):raise RuntimeError('OCR失败：'+r.get('error','未知错误'))
     return r
    raise TimeoutError('OCR超过120秒，已停止，未执行标记')
   except BaseException:self.close();raise

_workers={};_lock=threading.Lock()
def worker(root):
 key=str(Path(root).resolve())
 with _lock:
  if key not in _workers:_workers[key]=OCRWorker(root)
  return _workers[key]
def close_workers():
 for w in _workers.values():w.close()
atexit.register(close_workers)
