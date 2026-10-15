"""Local result archive with bounded image retention; never accesses the game."""
import csv,json,re,time,os
from pathlib import Path
from PIL import Image

def atomic_json(path,value):
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8');os.replace(tmp,path)

def combined_records(root,run):
 """Follow the continuation chain; keep each original observation/image once."""
 root=Path(root).resolve();run_id=Path(run).name;seen=set();parts=[]
 while run_id:
  if not re.fullmatch('[0-9a-f]{32}',run_id) or run_id in seen:raise ValueError('续扫记录关联无效或形成循环')
  seen.add(run_id);folder=root/'数据/整理记录'/run_id;archived=root/'数据/历史记录'/run_id/'results.json'
  source=archived if archived.exists() else folder/'results.json'
  if not source.exists():raise ValueError('缺少此前扫描记录：'+run_id+'；未清空当前结果')
  rows=json.loads(source.read_text(encoding='utf-8'))
  parts.append([dict(row,origin_run=run_id,origin_index=i) for i,row in enumerate(rows,1)])
  parent=None
  link=folder/'continuation.json';checkpoint=folder/'checkpoint.json'
  if link.exists():parent=json.loads(link.read_text(encoding='utf-8'))
  elif checkpoint.exists():parent=json.loads(checkpoint.read_text(encoding='utf-8')).get('parent')
  run_id=Path(parent['folder']).name if parent and parent.get('folder') else None
 return [row for part in reversed(parts) for row in part]

def archive(root,run,records,reason=''):
 root=Path(root).resolve();run=Path(run).resolve()
 if not re.fullmatch('[0-9a-f]{32}',run.name):return None
 dest=root/'数据/历史记录'/run.name;dest.mkdir(parents=True,exist_ok=True)
 saved=[]
 for n,row in enumerate(records,1):
  o=dict(row['observation']);e=row['evaluation'];source=Path(o.get('image',''))
  image=dest/f'{n:04d}.png'
  if not image.exists() and source.is_file():
   with Image.open(source) as im:
    # Retain detail pixels losslessly at original coordinates for future OCR replay.
    canvas=Image.new('RGB',(1280,720),'#181b20');canvas.paste(im.convert('RGB').crop((0,0,550,720)),(0,0));canvas.save(image,optimize=True)
   os.utime(image,(source.stat().st_mtime,)*2)
  o['image']=str(image);o['original']=str(image)
  saved.append(dict(row,observation=o,recommended_for=e.get('eligible_matches',[]),matching_agents=[{'character':m['character'],'score':m['score'],'reason':m['reason']} for m in e['matches']]))
 atomic_json(dest/'results.json',saved)
 if (run/'results.json').exists():os.utime(dest/'results.json',((run/'results.json').stat().st_mtime,)*2)
 complete=combined_records(root,run)
 atomic_json(dest/'summary.json',{'count':len(saved),'total_count':len(complete),'reason':reason,'created':time.time(),'folder':str(dest)})
 with (dest/'结果摘要.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f);w.writerow(['序号','心锚','数值分','匹配分','结果','推荐保留探员','匹配探员（不等于通过保留）','原因','截图'])
  for n,r in enumerate(complete,1):
   e=r['evaluation'];picture=os.path.relpath(r['observation']['image'],dest)
   w.writerow([n,r['observation']['anchor'],e['value_score'] if e['value_score'] is not None else e['value_range'],e['match_score'],e['decision'],'、'.join(m['character'] for m in e.get('eligible_matches',[])) or '无；直接数值保留不指定探员','、'.join(m['character'] for m in e['matches']), '；'.join(e['reasons']),picture])
 return dest

def clear_run_temporaries(root,run,records):
 root=Path(root).resolve();run=Path(run).resolve();data=root/'数据'
 if run.parent!=data/'整理记录' or not re.fullmatch('[0-9a-f]{32}',run.name):return
 for p in run.glob('frame-*.png'):
  if p.resolve().parent==run and re.fullmatch(r'frame-\d+\.png',p.name):p.unlink(missing_ok=True)
 for r in records:
  p=Path(r['observation'].get('evidence','')).resolve()
  if p.parent!=data/'识别记录' or not re.fullmatch('[0-9a-f]{32}',p.name):continue
  for name in ['input.png','input.png.zoom.png','input.png.rows.png','ocr.json','observation.json']:
   f=p/name
   if f.resolve().parent==p:f.unlink(missing_ok=True)
  try:p.rmdir()
  except OSError:pass

def prune(root,days=7,max_mb=300):
 folder=Path(root).resolve()/'数据/历史记录';files=[];now=time.time();removed=0
 for p in folder.glob('*/*.png'):
  if p.is_symlink() or p.resolve().parent.parent!=folder or not re.fullmatch('[0-9a-f]{32}',p.parent.name) or not re.fullmatch(r'\d{4}\.png',p.name):continue
  st=p.stat();files.append((st.st_mtime,st.st_size,p))
 # Include standalone OCR snapshots in the same image budget. A one-hour grace
 # protects captures currently being inspected or written by a running instance.
 other=folder.parent/'识别记录'
 for p in other.glob('*/*.png'):
  if p.is_symlink() or p.resolve().parent.parent!=other or not re.fullmatch('[0-9a-f]{32}',p.parent.name):continue
  if p.name not in ['input.png','input.png.zoom.png','input.png.rows.png']:continue
  st=p.stat()
  if now-st.st_mtime>3600:files.append((st.st_mtime,st.st_size,p))
 size=sum(x[1] for x in files)
 diagnostics=folder.parent/'整理记录'
 for p in diagnostics.glob('*/*.png'):
  if p.is_symlink() or p.resolve().parent.parent!=diagnostics or not re.fullmatch('[0-9a-f]{32}',p.parent.name) or p.name not in ('navigation-before.png','navigation-after.png','checkpoint.png'):continue
  st=p.stat()
  if now-st.st_mtime>3600:files.append((st.st_mtime,st.st_size,p));size+=st.st_size
 for date,n,p in sorted(files):
  if now-date>days*86400 or size>max_mb*1024**2:p.unlink();size-=n;removed+=1
 return {'removed_images':removed,'remaining_image_bytes':size,'days':days,'max_mb':max_mb}

def maintain(root,days=7,max_mb=300):
 root=Path(root).resolve();converted=0
 for run in (root/'数据/整理记录').glob('*'):
  if not re.fullmatch('[0-9a-f]{32}',run.name) or not (run/'summary.json').exists() or not (run/'results.json').exists():continue
  rows=json.loads((run/'results.json').read_text(encoding='utf-8'))
  dest=root/'数据/历史记录'/run.name/'results.json'
  if dest.exists() or archive(root,run,rows):clear_run_temporaries(root,run,rows);converted+=1
 for p in (root/'数据/整理记录').glob('*/frame-*.png'):
  if not p.is_symlink() and p.resolve().parent.parent==root/'数据/整理记录' and re.fullmatch('[0-9a-f]{32}',p.parent.name) and re.fullmatch(r'frame-\d+\.png',p.name) and time.time()-p.stat().st_mtime>3600:p.unlink()
 return dict(prune(root,days,max_mb),archived_runs=converted)
