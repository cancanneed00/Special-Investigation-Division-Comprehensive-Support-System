"""Constrained inventory navigation. Only lock and discard markers may be changed."""
import json,time,threading,subprocess,queue,uuid,os
from pathlib import Path
from engine import recognize,evaluate
import vision,interference
from history import atomic_json

class Stopped(Exception):pass
class Bridge:
 def __init__(self,root,stop):
  self.root=Path(root);self.app=self.root/'程序文件';self.stop=stop;self.id=uuid.uuid4().hex
  self.folder=self.root/'数据'/'整理记录'/self.id;self.folder.mkdir(parents=True)
  self.stopfile=self.folder/'stop';self.guards=[];self.serial=0;self.capture_paths=[];self.metrics={}
  self.asset=self.app/'resource/image';self.asset.mkdir(parents=True,exist_ok=True)
  self.log=(self.folder/'driver.log').open('w',encoding='utf-8')
  self.proc=subprocess.Popen([str(self.app/'runtime/node.exe'),str(self.app/'game_driver.js'),str(self.stopfile)],
     stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,text=True,encoding='utf-8',cwd=self.app,
     creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  self.responses=queue.Queue()
  def pump():
   for line in self.proc.stdout:
    try:self.responses.put(json.loads(line))
    except Exception:self.log.write(line);self.log.flush()
  threading.Thread(target=pump,daemon=True).start()
 def check(self):
  if self.stop.is_set():self.stopfile.touch();raise Stopped('用户已停止')
 def rpc(self,op,**kwargs):
  self.check();self.serial+=1;q={'id':self.serial,'op':op,**kwargs};started=time.perf_counter()
  self.proc.stdin.write(json.dumps(q,ensure_ascii=False)+'\n');self.proc.stdin.flush();end=time.monotonic()+45
  while time.monotonic()<end:
   self.check()
   try:
    result=self.responses.get(timeout=.1)
    if result.get('id')!=self.serial:continue
    if not result.get('ok'):raise RuntimeError(result.get('error','游戏驱动错误'))
    stat=self.metrics.setdefault(op,{'count':0,'seconds':0});stat['count']+=1;stat['seconds']+=time.perf_counter()-started
    interference.POINTER.commit()  # the driver's own cursor motion is the expected state
    return result['result']
   except queue.Empty:
    if self.proc.poll() is not None:raise RuntimeError('游戏驱动意外退出，请查看整理记录')
  raise TimeoutError('游戏响应超时，已停止本轮整理')
 def capture(self):
  path=self.folder/('frame-'+str(self.serial+1)+'.png');self.rpc('capture',output=str(path));self.capture_paths.append(path)
  if len(self.capture_paths)>12:self.capture_paths.pop(0).unlink(missing_ok=True)
  return path
 def guard(self,path,detail=True):
  for p in self.guards:p.unlink(missing_ok=True)
  self.guards=[]
  im=vision.image(path);out=[]
  boxes=[(570,88,1200,645),(578,32,716,70)]+([(300,60,538,335),(98,390,518,487)] if detail else [])
  for i,box in enumerate(boxes):
   name='guard-'+self.id+'-'+str(self.serial)+'-'+str(i)+'.png';p=self.asset/name
   im.crop(box).save(p);self.guards.append(p)
   out.append({'name':name,'roi':[box[0]-2,box[1]-2,box[2]-box[0]+4,box[3]-box[1]+4]})
  return out
 def close(self):
  self.stopfile.touch()
  try:
   self.proc.stdin.close();self.proc.wait(timeout=2)
  except Exception:self.proc.kill();self.proc.wait(timeout=5)
  self.log.close()
  for p in self.guards:
   try:p.unlink(missing_ok=True)
   except OSError:pass

def capture_current(root,model,stop=None):
 b=Bridge(root,stop or threading.Event())
 try:return recognize(root,b.capture(),model,stop=stop)
 finally:b.close()

def mark_one(bridge,path,decision,cell=None):
 before=vision.image(path)
 if decision not in ('锁定','标记放弃'):return '未标记'
 kind='lock' if decision=='锁定' else 'discard'
 lock=vision.mark_state(before,'lock');drop=vision.mark_state(before,'discard')
 if lock=='on':return '已锁定，保留原状态'
 state=lock if kind=='lock' else drop
 if state=='on':return '已经标记放弃'
 if state!='off' or (kind=='lock' and drop!='off') or (kind=='discard' and lock!='off'):
  return '状态不明或标记冲突，跳过'
 if cell and not vision.selected_cell(before,cell['col'],cell['y']):raise RuntimeError('心锚选中框未确认，停止标记')
 bridge.check();bridge.rpc('mark',kind=kind,guard=bridge.guard(path))
 time.sleep(.35);afterpath=bridge.capture();after=vision.image(afterpath)
 if not vision.detail_same(before,after):raise RuntimeError('标记后详情变化，停止本轮整理')
 if vision.mark_state(after,kind)!='on':raise RuntimeError('已发送'+decision+'，但图标状态未确认；已停止，绝不重复切换')
 return decision+'成功'

def prepare_level_order(b,progress):
 b.check();p=b.capture();order=vision.level_order(vision.image(p))
 if order=='unknown':raise RuntimeError('无法确认等级排序箭头，停止扫描')
 if order=='low_first':progress('已确认低等级优先');return
 progress('切换等级排序：优先扫描1级心锚')
 b.rpc('sort_level',guard=b.guard(p,False));time.sleep(.7)
 if vision.level_order(vision.image(b.capture()))!='low_first':
  raise RuntimeError('等级排序切换后未确认低等级优先，停止扫描')

def wait_grid_still(b):
 # Unity inertia continues after pointer release. Do not build a guard mid-scroll.
 time.sleep(1);previous=None;stable=0
 for attempt in range(15):
  b.check();p=b.capture();im=vision.image(p);cells=vision.grid_cells(im)
  current=(sorted({c['y'] for c in cells}),vision.row_signatures(im,cells))
  stable=stable+1 if cells and previous and current[0]==previous[0] and vision.overlap(previous[1],current[1])==-1 else 0
  if stable>=2:return p
  previous=current;time.sleep(.3)
 if isinstance(b,Bridge):
  im.save(b.folder/'navigation-after.png')
  (b.folder/'navigation.json').write_text(json.dumps({'stage':'wait_grid_still','last_cells':cells,'last_row_positions':current[0]},ensure_ascii=False,indent=2),encoding='utf-8')
 raise RuntimeError('列表滑动后未稳定，停止扫描')

def rewind_inventory(b,progress):
 stable=0
 for step in range(100):
  b.check();progress('返回列表顶部：第 '+str(step+1)+' 次滚动')
  p=b.capture();im=vision.image(p);cells=vision.grid_cells(im)
  if not cells:raise RuntimeError('未识别到仓库格子，无法开始批量扫描')
  old=vision.row_signatures(im,cells)
  b.rpc('scroll',direction='up',guard=b.guard(p,False))
  z=vision.image(wait_grid_still(b));newcells=vision.grid_cells(z);new=vision.row_signatures(z,newcells)
  stable=stable+1 if vision.overlap(old,new)==-1 and vision.same_row_positions(cells,newcells) else 0
  if stable>=3:return
 raise RuntimeError('未能确认列表顶部，停止扫描')

def recover_overlap(b,oldim,oldcells,newpath,progress):
 # Move only the list. Never re-send a lock/discard operation during recovery.
 for attempt in range(3):
  b.check();progress('翻页定位恢复：缓慢回退第 '+str(attempt+1)+' 次')
  b.rpc('scroll',direction='up',precise=True,guard=b.guard(newpath,False))
  newpath=wait_grid_still(b);im=vision.image(newpath);cells=vision.grid_cells(im)
  n=vision.selected_overlap(oldim,im,oldcells,cells)
  if n is not None:return n,newpath
 return None,newpath

def restore_selection(b,cell,pointer,progress):
 # A pointer nudge (or a transient frame change) can break the short
 # confirmation window. Wait it out, re-check the frames, and re-select this
 # same cell at most once through the whitelisted RPC. Never re-marks.
 def quick():
  p=b.capture();a=vision.image(p)
  for _ in range(10):
   b.check();time.sleep(.2);q=b.capture();im=vision.image(q)
   if vision.selected_cell(im,cell['col'],cell['y']) and vision.detail_same(a,im):return q,im
   a=im
  return None,None
 for round_no in (1,2,3):
  progress(f'选中或详情校验未通过：等待复检（第 {round_no}/3 次，{pointer.describe()}）')
  time.sleep(.6)
  p,im=quick()
  if p is not None:return p,im
  if round_no==2:
   progress('选中状态仍未恢复：重新发送一次选择点击（仅选择，不含标记）')
   base=b.capture()
   b.rpc('select',col=cell['col'],y=cell['y'],guard=b.guard(base,False))
   pointer.commit()
 return None,None

def save_navigation_failure(b,oldim,newim,oldcells,newcells,count):
 # At most two diagnostic frames per failed run, included in the image budget.
 oldim.save(b.folder/'navigation-before.png');newim.save(b.folder/'navigation-after.png')
 (b.folder/'navigation.json').write_text(json.dumps({'processed':count,'old_cells':oldcells,'new_cells':newcells,
  'same_detail':vision.detail_same(oldim,newim),'selected_before':[c for c in oldcells if vision.selected_cell(oldim,c['col'],c['y'])],
  'selected_after':[c for c in vision.grid_cells(newim,partial=True) if vision.selected_cell(newim,c['col'],c['y'])]},ensure_ascii=False,indent=2),encoding='utf-8')

def run_inventory(root,model,policy,selected,stop,notify,scroll=True,max_items=3000,bridge_factory=Bridge,recognizer=recognize,apply_marks=True,progress=None,resume=None):
 # Cross-process lock prevents two terminals from touching the same warehouse.
 import msvcrt
 lockpath=Path(root)/'数据'/'automation.lock';lockpath.parent.mkdir(parents=True,exist_ok=True)
 mutex=lockpath.open('a+b');mutex.seek(0);mutex.write(b'0');mutex.flush();mutex.seek(0)
 try:msvcrt.locking(mutex.fileno(),msvcrt.LK_NBLCK,1)
 except OSError:mutex.close();raise RuntimeError('另一个心锚终端正在整理')
 b=None;records=[];reason='当前页已处理';skip_rows=0;progress=progress or (lambda text:None);started=time.perf_counter()
 parent=None;start_boundary=None
 if resume:
  policy=resume.get('policy') or policy;selected=resume.get('selected');apply_marks=resume['apply_marks']
  parent={'folder':resume['folder'],'total_before':resume.get('total_before',resume['count']),'manual':bool(resume.get('manual'))}
 def checkpoint(im,cell):
  if isinstance(b,Bridge):
   from resume_scan import save_checkpoint
   save_checkpoint(b,im,cell,len(records),policy,selected,apply_marks,parent)
 try:
  b=bridge_factory(root,stop)
  interference.POINTER.commit()
  if resume:
   from resume_scan import selected_boundary
   start_boundary=selected_boundary(vision.image(b.capture()),resume,resume.get('manual',False))
   progress('续扫起点已确认；此前完成 '+str(parent['total_before'])+' 件，本轮不回到顶部')
  elif scroll:
   prepare_level_order(b,progress)
   rewind_inventory(b,progress)
  page=0;stall=0
  while len(records)<max_items:
   before=len(records)
   b.check();path=b.capture();im=vision.image(path);cells=vision.grid_cells(im)
   ys=sorted({c['y'] for c in cells})
   if not cells:raise RuntimeError('未识别到完整心锚格子，请切换为默认仓库网格视图')
   pending=[c for c in cells if ys.index(c['y'])>=skip_rows]
   if start_boundary is not None:
    from resume_scan import remaining_cells
    pending=remaining_cells(cells,start_boundary,resume.get('manual',False));start_boundary=None
   for cell in pending:
    b.check()
    if len(records)>=max_items:break
    progress(f'第 {page+1} 页：选择第 {len(records)+1} 件心锚')
    current=b.capture()
    if not vision.selected_cell(vision.image(current),cell['col'],cell['y']):
     b.rpc('select',col=cell['col'],y=cell['y'],guard=b.guard(current,False))
     interference.POINTER.commit()
    time.sleep(.3);first=b.capture();a=vision.image(first)
    for attempt in range(10):
     b.check();time.sleep(.2);second=b.capture();z=vision.image(second)
     if vision.selected_cell(z,cell['col'],cell['y']) and vision.detail_same(a,z):break
     a=z
    else:
     # A nudge of the physical mouse used to abort the run on the first failed
     # confirmation window. Wait it out, re-check, re-select once, then decide.
     second,z=restore_selection(b,cell,interference.POINTER,progress)
     if second is None:raise RuntimeError('选中框或详情多次等待与重选后仍未稳定（疑似鼠标被移动），已停止整理')
    # Low-star anchors are no longer pre-skipped: a name-only OCR pass inside
    # recognize() can still surface a usable event anchor from the workbook.
    progress(f'第 {page+1} 页：识别并评分第 {len(records)+1} 件');ocr_started=time.perf_counter()
    if recognizer is recognize:
     from ocr_worker import OCRCancelled
     try:obs=recognizer(root,second,model,stop=stop)
     except OCRCancelled:raise Stopped('用户已停止')
    else:obs=recognizer(root,second,model)
    ocr_seconds=time.perf_counter()-ocr_started;b.check();ev=evaluate(model,obs,selected,policy)
    if obs.get('level')!=1 and obs.get('rarity') not in (1,2):
     ev.update(decision='跳过',reasons=['仓库仅处理1级；其他等级仅支持单件预览'])
    fresh=b.capture()
    if not vision.detail_same(z,vision.image(fresh)):
     # Pointer interference during scoring can unseat the selection. Wait it
     # out, then re-select the same cell and require the scored frame back.
     recovered=False
     for round_no in (1,2):
      progress(f'评分期间检测到选择变化：等待复检（第 {round_no}/2 次，{interference.POINTER.describe()}）')
      time.sleep(.6);fresh=b.capture()
      if vision.detail_same(z,vision.image(fresh)):recovered=True;break
     if not recovered:
      q,im=restore_selection(b,cell,interference.POINTER,progress)
      if q is None or not vision.detail_same(z,im):
       raise RuntimeError('评分期间选择发生变化，等待与重选后仍无法确认原心锚（疑似鼠标被移动），已停止整理')
      fresh=q
    if obs.get('rarity') in (1,2):
     # Event anchors keep their fixed value: never send a lock or discard marker.
     action=('活动心锚 · 可保留使用' if ev['decision']=='活动心锚' else ('一星跳过' if obs['rarity']==1 else '二星跳过')) if apply_marks else '仅评分：'+ev['decision']
    else:
     action=(mark_one(b,fresh,ev['decision'],cell) if obs.get('level')==1 else '跳过非1级') if apply_marks else '仅评分：'+ev['decision']
    row={'page':page,'cell':cell,'observation':obs,'evaluation':ev,'action':action,'ocr_seconds':round(ocr_seconds,3)}
    records.append(row);atomic_json(b.folder/'results.json',records)
    checkpoint(vision.image(b.capture()) if apply_marks and action.endswith('成功') else vision.image(fresh),cell)
    notify(row,len(records))
   if not scroll or len(records)>=max_items:break
   oldpath=b.capture();oldim=vision.image(oldpath);oldcells=vision.grid_cells(oldim);old=vision.row_signatures(oldim,oldcells)
   progress(f'已扫描 {len(records)} 件，滚动到下一页')
   b.rpc('scroll',direction='down',guard=b.guard(oldpath,False))
   newpath=wait_grid_still(b);newim=vision.image(newpath);newcells=vision.grid_cells(newim);new=vision.row_signatures(newim,newcells)
   n=vision.selected_overlap(oldim,newim,oldcells,newcells)
   if n is None:n=vision.overlap(old,new)
   if n==-1 and not vision.same_row_positions(oldcells,newcells):n=len(new)
   if n==-1:
    # Retry navigation only; marking is never retried. Never claim full completion from a failed swipe.
    for retry in range(2):
     b.rpc('scroll',direction='down',guard=b.guard(newpath,False))
     newpath=wait_grid_still(b);newim=vision.image(newpath);newcells=vision.grid_cells(newim);new=vision.row_signatures(newim,newcells);n=vision.selected_overlap(oldim,newim,oldcells,newcells)
     if n is None:n=vision.overlap(old,new)
     if n==-1 and not vision.same_row_positions(oldcells,newcells):n=len(new)
     if n!=-1:break
    if n==-1:reason='列表连续3次没有变化，已停止（到达末尾或游戏未响应滚动）';break
   if n is None:
    if isinstance(b,Bridge):save_navigation_failure(b,oldim,newim,oldcells,newcells,len(records))
    n,newpath=recover_overlap(b,oldim,oldcells,newpath,progress)
    if n is None:reason='翻页重叠行无法唯一确认，回退恢复未成功；已保存翻页诊断画面，停止以避免漏处理';break
   skip_rows=n;page+=1
   if len(records)==before:
    stall+=1
    if stall>=2:reason='已到达列表末尾（连续多页无新内容）';break
   else:stall=0
  if len(records)>=max_items:reason='达到本轮数量上限'
  return {'count':len(records),'reason':reason,'folder':str(b.folder)}
 except Stopped:
  reason='用户已停止';return {'count':len(records),'reason':reason,'folder':str(b.folder) if b else ''}
 except Exception as e:
  reason='异常停止：'+str(e);progress(reason);raise
 finally:
  if b:
   try:
    if parent:(b.folder/'continuation.json').write_text(json.dumps(parent,ensure_ascii=False,indent=2),encoding='utf-8')
    (b.folder/'summary.json').write_text(json.dumps({'count':len(records),'reason':reason,'apply_marks':apply_marks,'continuous':scroll,'skipped_low_star':sum(1 for r in records if r['observation'].get('rarity') in (1,2) and r['evaluation'].get('decision')=='跳过'),'skipped_one_star':sum(1 for r in records if r['observation'].get('rarity')==1 and r['evaluation'].get('decision')=='跳过'),'skipped_two_star':sum(1 for r in records if r['observation'].get('rarity')==2 and r['evaluation'].get('decision')=='跳过'),'event_anchors':sum(1 for r in records if r['observation'].get('rarity') in (1,2) and r['evaluation'].get('decision')!='跳过'),'elapsed_seconds':round(time.perf_counter()-started,3),'rpc_timing':getattr(b,'metrics',{}),'ocr_seconds':round(sum(r.get('ocr_seconds',0) for r in records),3)},ensure_ascii=False,indent=2),encoding='utf-8')
   finally:b.close()
   if isinstance(b,Bridge):
    from history import archive,clear_run_temporaries,prune
    try:
     originals=[{'observation':dict(r['observation'])} for r in records]
     dest=archive(root,b.folder,records,reason)
     if dest:
      for n,r in enumerate(records,1):r['observation']['image']=str(dest/f'{n:04d}.png')
      (b.folder/'results.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf-8')
      clear_run_temporaries(root,b.folder,originals)
     prune(root)
    except Exception as e:progress('结果已保存，历史整理待重试：'+str(e))
  mutex.seek(0);msvcrt.locking(mutex.fileno(),msvcrt.LK_UNLCK,1);mutex.close()
