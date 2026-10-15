"""Persist completed work and validate an explicit continuation boundary."""
from pathlib import Path
import json,time
import vision

def save_checkpoint(bridge,image,cell,count,policy,selected,apply_marks,parent=None):
 from history import atomic_json
 folder=bridge.folder
 tmp=folder/'checkpoint.tmp.png';image.save(tmp);tmp.replace(folder/'checkpoint.png')
 atomic_json(folder/'checkpoint.json',{'version':1,'count':count,'cell':cell,'policy':policy,'selected':selected,
   'apply_marks':apply_marks,'parent':parent,'updated':time.time(),'frame':str(folder/'checkpoint.png')})

def latest_checkpoint(root):
 folders=sorted((Path(root)/'数据/整理记录').glob('*'),key=lambda p:p.stat().st_mtime,reverse=True)
 for folder in folders:
  path=folder/'results.json'
  if not path.exists():continue
  try:
   rows=json.loads(path.read_text(encoding='utf-8'))
   if not rows:continue
   saved=folder/'checkpoint.json'
   if saved.exists():
    state=json.loads(saved.read_text(encoding='utf-8'))
    if state['count']!=len(rows):state.update(count=len(rows),cell=rows[-1]['cell'],frame=rows[-1]['observation'].get('image',''),legacy=True)
   else:
    summary=json.loads((folder/'summary.json').read_text(encoding='utf-8'))
    last=rows[-1];frame=folder/'navigation-before.png'
    state={'count':len(rows),'cell':last['cell'],'apply_marks':summary.get('apply_marks',False),
     'policy':next((r['evaluation']['policy'] for r in reversed(rows) if 'policy' in r['evaluation']),None),
     'selected':None,'frame':str(frame if frame.exists() else last['observation'].get('image','')),'legacy':True}
   state['folder']=str(folder);state['last_anchor']=rows[-1]['observation'].get('anchor','未知心锚')
   state['last_image']=rows[-1]['observation'].get('image','')
   state['total_before']=state.get('parent',{}).get('total_before',0)+state['count'] if state.get('parent') else state['count']
   return state
  except (OSError,ValueError,KeyError,TypeError):continue
 return None

def selected_boundary(current,state,manual=False):
 cells=vision.grid_cells(current)
 if not cells:raise RuntimeError('当前没有完整可见的仓库格子，请将列表停稳后重新继续')
 candidates=[c for c in vision.grid_cells(current,partial=True) if vision.selected_cell(current,c['col'],c['y'])]
 if len(candidates)!=1:raise RuntimeError('无法唯一确认选中项。请手动选中第一件未处理心锚，再使用手动续扫')
 anchor=candidates[0]
 if vision.level_order(current)!='low_first':raise RuntimeError('续扫要求保持原来的低等级优先排序，请勿更改等级排序')
 if manual:
  if not any(c['col']==anchor['col'] and abs(c['y']-anchor['y'])<=3 for c in cells):
   raise RuntimeError('手动起点必须完整可见，请将选中项滚动到列表中间')
 else:
  frame=Path(state.get('frame',''))
  if not frame.is_file():raise RuntimeError('断点截图已清理，请使用手动续扫选择第一件未处理心锚')
  before=vision.image(frame)
  if not vision.detail_same(before,current) or anchor['col']!=state['cell']['col']:
   raise RuntimeError('当前选中项与最后完成项不一致，请使用手动续扫校正起点')
  oldcells=vision.grid_cells(before,partial=True)
  oldsel=[c for c in oldcells if vision.selected_cell(before,c['col'],c['y'])]
  if len(oldsel)!=1 or oldsel[0]['col']!=state['cell']['col']:
   raise RuntimeError('断点缺少唯一选中框证据，请使用手动续扫')
  # Sorting/header and warehouse count must remain unchanged between sessions.
  from PIL import ImageChops,ImageStat
  for box in [(575,27,1055,72),(565,655,698,692)]:
   if sum(ImageStat.Stat(ImageChops.difference(before.crop(box),current.crop(box))).mean)/3>5:
    raise RuntimeError('排序或仓库数量发生变化，请手动确认第一件未处理心锚')
 return anchor

def remaining_cells(cells,anchor,include):
 return [c for c in cells if c['y']>anchor['y']+3 or (abs(c['y']-anchor['y'])<=3 and (c['col']>=anchor['col'] if include else c['col']>anchor['col']))]
