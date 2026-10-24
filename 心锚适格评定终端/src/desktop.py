import sys,os,json,threading,queue,traceback,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import tcl_env  # 必须早于任何 import tkinter：固定随包 Tcl/Tk，避免与系统版本冲突
import tkinter as tk
from tkinter import ttk,filedialog,messagebox
from PIL import Image,ImageTk
import app as base
import ui_v4 as ui
import history as archive_store
from engine import evaluate,recognize,reparse_saved,VERSION
from scoring import DEFAULT_POLICY,validate_policy
from automation import capture_current,run_inventory
ROOT=base.ROOT

def score_text(value,bounds=None):
 if value is not None:return f'{value:.2f}'
 if bounds:return f'{bounds[0]:.2f}—{bounds[1]:.2f}'
 return '未确定'

class App(base.App):
 def build_catalog(self):return ui.build_catalog(self)
 def filter_chars(self):return ui.filter_chars(self)
 def catalog_select(self):return ui.catalog_select(self)
 def switch_catalog_mode(self):return ui.switch_catalog_mode(self)
 def catalog_source_changed(self):return ui.catalog_source_changed(self)
 def show_anchor(self):return ui.show_anchor(self)
 def jump_to_catalog(self,name):return ui.jump_to_catalog(self,name)
 def show_character(self):return ui.show_character(self)
 def __init__(self):
  self.policyvars={};self.events=queue.Queue();self.stop_event=threading.Event();self.batch_records=[]
  super().__init__();self.title('心锚适格评定终端 '+VERSION+'  ·  双评分与仓库整理')
  self.minsize(960,680)
  icon=Path(__file__).parent/'assets/app.png'
  if icon.exists():
   self.app_icon=ImageTk.PhotoImage(Image.open(icon));self.iconphoto(True,self.app_icon)
   version_icon=icon.parent/('app-'+VERSION+'.ico')
   self.iconbitmap(str(version_icon if version_icon.exists() else icon.with_suffix('.ico')))
  self.tabs.tab(self.scan,text='自动识别与双评分')
  self.rulespage=ttk.Frame(self.tabs,padding=18);self.tabs.insert(2,self.rulespage,text='保留与放弃规则');self.build_policy()
  self.batchpage=ttk.Frame(self.tabs,padding=14);self.tabs.insert(2,self.batchpage,text='历史与本轮结果')
  self.batchstatus=tk.StringVar(value='等待开始批量扫描')
  historybar=ttk.Frame(self.batchpage);historybar.pack(fill='x')
  self.historychoice=ttk.Combobox(historybar,state='readonly',width=65);self.historychoice.pack(side='left',fill='x',expand=True)
  ttk.Button(historybar,text='载入历史',command=self.load_history).pack(side='left',padx=6)
  ttk.Button(historybar,text='打开结果文件夹',command=lambda:os.startfile(ROOT/'数据/历史记录')).pack(side='left')
  ttk.Label(self.batchpage,textvariable=self.batchstatus).pack(anchor='w',pady=10)
  historytable=ttk.Frame(self.batchpage);historytable.pack(fill='both',expand=True)
  self.history=ttk.Treeview(historytable,columns=['n','name','level','value','match','action','reason'],show='headings')
  for c,label,w in [('n','序号',45),('name','心锚',125),('level','等级',45),('value','数值分',90),('match','最高匹配分',90),('action','结果',125),('reason','关键依据',250)]:
   self.history.heading(c,text=label);self.history.column(c,width=w,minwidth=40,stretch=c in ('name','reason'))
  sb=ttk.Scrollbar(historytable,command=self.history.yview);sb.pack(side='right',fill='y');self.history.configure(yscrollcommand=sb.set)
  self.history.configure(height=7)
  self.history.pack(fill='both',expand=True);self.history.bind('<<TreeviewSelect>>',self.select_history);self.history.bind('<Double-1>',lambda e:ui.open_details(self))
  self.batchreason=tk.StringVar(value='选择一行可查看识别、数值和处理原因。')
  preview=ttk.Frame(self.batchpage);preview.pack(side='bottom',fill='x',pady=6,before=historytable)
  self.historypicture=tk.Label(preview,bg=base.PANEL,fg=base.MUTED,text='选中结果查看截图',width=24,height=9);self.historypicture.pack(side='left',padx=(0,12))
  self.historycaption=tk.StringVar(value='选择结果查看截图与关键依据；双击查看完整详情。')
  info=ttk.Frame(preview);info.pack(side='left',fill='both',expand=True)
  ui.label(info,variable=self.historycaption)
  ttk.Button(info,text='详细依据 ↗',command=lambda:ui.open_details(self)).pack(anchor='w')
  footer=ttk.Frame(self.batchpage);footer.pack(side='bottom',fill='x',pady=8,before=preview)
  ttk.Button(footer,text='停止（回车）',command=self.stop).pack(side='left')
  self.replaybtn=ttk.Button(footer,text='载入上轮记录并重新评分（不操作游戏）',command=self.replay);self.replaybtn.pack(side='left',padx=12)
  ttk.Button(footer,text='断点 / 手动续扫',command=self.resume_scan).pack(side='left')
  self.tabs.select(self.scan)
  for parent in self.winfo_children():
   for c in parent.winfo_children():
    if isinstance(c,ttk.Label) and c.cget('text')=='识别预览版  ·  游戏操作未启用':c.configure(text='双评分  ·  仅锁定 / 标记放弃')
  self.bind('<Return>',lambda e:self.stop());self.bind('<KP_Enter>',lambda e:self.stop());self.after(100,self.poll_events)
  self.refresh_history()
 def refresh_history(self):
  previous=self.historychoice.get()
  self.saved_runs=sorted((ROOT/'数据/历史记录').glob('*/results.json'),key=lambda p:p.stat().st_mtime,reverse=True)
  from datetime import datetime
  self.historychoice['values']=[datetime.fromtimestamp(p.stat().st_mtime).strftime('%m-%d %H:%M')+'  '+p.parent.name[:8] for p in self.saved_runs]
  if previous in self.historychoice['values']:self.historychoice.set(previous)
  elif self.saved_runs:self.historychoice.current(0)
 def load_history(self):
  if self.busy or not self.model:return
  self.refresh_history();idx=self.historychoice.current()
  if idx<0:return
  self.batch_records=[];self.history.delete(*self.history.get_children())
  source=self.saved_runs[idx];policy=self.policy();self.stop_event.clear()
  def work():
   rows=archive_store.combined_records(ROOT,source.parent);count=0
   for n,row in enumerate(rows,1):
    if self.stop_event.is_set():break
    row['evaluation']=evaluate(self.model,row['observation'],policy=policy);row['action']='历史重评：'+row['evaluation']['decision'];self.events.put((row,n));count=n
   return count
  self.run('载入历史并重新评分…',work,lambda n:self.events.put((None,'已载入 '+str(n)+' 件；历史重评不会操作游戏。')))
 def close(self):
  if self.busy:self.stop();return
  self.destroy()
 def controls(self):return [self.loadbtn,self.ocrbtn,self.scorebtn,self.capturebtn,self.startbtn,self.batchbtn,self.replaybtn,self.resumebtn]
 def resume_scan(self):
  from resume_ui import open_resume
  open_resume(self)
 def run(self,label,fn,done):
  if self.busy:return
  if os.name=='nt':
   import ctypes
   ctypes.windll.user32.GetAsyncKeyState(0x0D) # Clear key presses from before this job.
  self.busy=True;self.status.set(label);self.configure(cursor='watch')
  for b in self.controls():b.configure(state='disabled')
  def job():
   try:self.jobs.put((done,fn(),None))
   except Exception as e:
    from ocr_worker import OCRCancelled
    if isinstance(e,OCRCancelled):self.jobs.put((lambda _:self.status.set('已停止识别'),None,None))
    else:self.jobs.put((None,None,(e,traceback.format_exc())))
  threading.Thread(target=job,daemon=True).start()
 def poll(self):
  try:
   done,value,error=self.jobs.get_nowait();self.busy=False;self.configure(cursor='')
   for b in self.controls():b.configure(state='normal')
   if error:self.error(error[0],error[1])
   else:
    try:done(value)
    except Exception as e:self.error(e,traceback.format_exc())
  except queue.Empty:pass
  self.after(100,self.poll)
 def poll_events(self):
  last=None
  try:
   for _ in range(8):
    row,count=self.events.get_nowait()
    if row is None:
     self.status.set(count);self.batchstatus.set(count);continue
    self.batch_records.append(row);o=row['observation'];e=row['evaluation']
    explanation=ui.brief(e)
    action=row['action'].replace('已锁定，保留原状态','已锁定').replace('历史重评：','建议：').replace('离线重评：','建议：')
    fixed=e.get('fixed_entries')
    self.history.insert('','end',iid=str(len(self.batch_records)-1),values=(count,o['anchor'],o.get('level'),'固定词条' if fixed else score_text(e['value_score'],e['value_range']),'不评分' if fixed else score_text(e['match_score']),action,explanation))
    self.history.see(str(len(self.batch_records)-1));last=(o,e)
    self.status.set(f'已处理 {count} 件  ·  {row["observation"]["anchor"]}  ·  {row["action"]}')
    self.batchstatus.set(self.status.get())
  except queue.Empty:pass
  if last:self.display(*last)
  if os.name=='nt' and self.busy:
   import ctypes
   if ctypes.windll.user32.GetAsyncKeyState(0x0D)&0x8001:self.stop()
  self.after(100,self.poll_events)
 def restore_scan_results(self,rows):
  # Restore the complete chain before starting the worker; no delayed old events.
  try:
   while True:self.events.get_nowait()
  except queue.Empty:pass
  self.batch_records=list(rows);self.history.delete(*self.history.get_children())
  for index,row in enumerate(rows):
   o=row['observation'];e=row['evaluation'];fixed=e.get('fixed_entries')
   self.history.insert('','end',iid=str(index),values=(index+1,o['anchor'],o.get('level'),'固定词条' if fixed else score_text(e['value_score'],e.get('value_range')),'不评分' if fixed else score_text(e['match_score']),row['action'],ui.brief(e)))
  self.batchstatus.set(f'保留此前 {len(rows)} 件，续扫结果将在末尾追加。')
 def select_history(self,event=None):
  s=self.history.selection()
  if s:
   r=self.batch_records[int(s[0])];self.display(r['observation'],r['evaluation'])
   self.batchreason.set(r['observation']['anchor']+'：'+'；'.join(r['evaluation']['reasons']+r['evaluation'].get('value_notes',[])))
   self.historypicture.configure(image=self.preview if self.preview else '',text='' if self.preview else '截图已按保留规则清理',width=150,height=165)
   e=r['evaluation']
   if e.get('fixed_entries'):
    names='、'.join(dict.fromkeys(m['character'] for m in e.get('matches',[]))) or '暂无探员推荐'
    lead='活动心锚 · 推荐使用：'
   else:
    names='、'.join(dict.fromkeys(m['character'] for m in e.get('eligible_matches',[]))) or '暂无满足推荐保留条件的探员'
    lead='满足推荐保留：'
   self.historycaption.set(r['observation']['anchor']+'  ·  '+e['decision']+'  ·  数值 '+('固定词条' if e.get('fixed_entries') else score_text(e['value_score'],e['value_range']))+' / 匹配 '+('不评分' if e.get('fixed_entries') else score_text(e['match_score']))+'\n'+ui.brief(e)+'\n'+lead+names)
 def accept_model(self,value):
  self.model,changed=value;m=self.model
  try:settings=json.loads(self.store.config.read_text(encoding='utf-8'))
  except Exception:settings={}
  settings['workbook']=m['filename'];self.store.config.write_text(json.dumps(settings,ensure_ascii=False),encoding='utf-8')
  self.summary.set(f'{len(m["characters"])} 探员 / {len(m["anchors"])} 心锚  ·  1 / 30级')
  self.agent['values']=['全部探员']+[c['name'] for c in m['characters']];self.agent.current(0)
  self.filter_chars();self.show_rules();self.status.set('数据就绪。导入截图，或在游戏仓库中开始识别。')
  if not getattr(self,'maintenance_started',False):
   self.maintenance_started=True
   self.after(200,lambda:self.run('正在整理历史截图和临时文件…',lambda:archive_store.maintain(ROOT),lambda r:(self.refresh_history(),self.status.set('历史整理完成，截图保留7天 / 300MB。'))))
 def build_scan(self):
  return ui.build_scan(self)

 def build_policy(self):
  return ui.build_policy(self)

 def policy(self):
  p={'version':2}
  for k,v in self.policyvars.items():
   p[k]={a:x.get() for a,x in v.items()}
  return validate_policy(p)
 def save_policy(self):
  try:
   p=self.policy()
   try:s=json.loads(self.store.config.read_text(encoding='utf-8'))
   except Exception:s={}
   s['policy']=p;self.store.config.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8');self.status.set('规则已保存');self.calculate()
  except Exception as e:messagebox.showerror('规则无效',str(e))
 def show_rules(self):
  return ui.show_rules(self)

 def accept_obs(self,obs):
  self.obs=obs;self.calculate();self.status.set('自动识别和双评分完成。')
 def calculate(self):
  if not self.obs or not self.model:return
  try:
   ev=evaluate(self.model,self.obs,None if self.agent.get()=='全部探员' else [self.agent.get()],self.policy());self.display(self.obs,ev)
  except Exception as e:messagebox.showerror('评分失败',str(e))
 def display(self,obs,ev):
  self.obs=obs;self.current_obs=obs;self.result=ev
  try:
   with Image.open(obs['image']) as im:im=im.copy().crop((0,0,550,720));im.thumbnail((150,195));self.preview=ImageTk.PhotoImage(im)
  except (FileNotFoundError,OSError):self.preview=None
  self.picture.configure(image=self.preview if self.preview else '',text='' if self.preview else '截图已清理',width=150,height=195)
  self.titlevar.set(f'{obs["anchor"]}  ·  等级 {obs.get("level","?")}  ·  {ev["entry_count"]} 条'+('固定词条' if ev.get('fixed_entries') else '词条'))
  if ev.get('fixed_entries'):self.scoresvar.set('活动心锚 · 词条数值按原表固定，不评分')
  else:self.scoresvar.set('数值分 '+score_text(ev['value_score'],ev['value_range'])+'    最高匹配分 '+score_text(ev['match_score']))
  self.fields.delete(*self.fields.get_children());details={str(d['position']):d for d in ev['value_details']}
  for key in ('1','2','3','4'):
   v=obs['entries'].get(key);d=details.get(key,{})
   if ev.get('fixed_entries'):
    self.fields.insert('','end',values=(key,d.get('stat') or '无','—',d.get('tier') or '—'));continue
   self.fields.insert('','end',values=(key,v['stat'] if v else '无' if obs.get('presence',{}).get(key)=='absent' else '未确定',
     (str(v['value'])+('%' if v['unit']=='percent' else '')) if v else '—',d.get('tier','—')))
  if ev.get('fixed_entries'):self.traitvar.set('；'.join(ev.get('trait_notes',[])) or '特性：按原表展示')
  else:self.traitvar.set('特性（仅供参考，不计分）：'+' / '.join(obs['traits'].get(k) or '无/未确定' for k in ('1','2')))
  normalized=[v['raw_stat']+' '+v['raw_value']+' → '+v['stat']+' '+v['value'] for v in obs['entries'].values() if v and 'raw_stat' in v and (v['raw_stat'],v['raw_value'])!=(v['stat'],v['value'])]
  self.decision.set(ui.brief(ev) if ev.get('decision')=='活动心锚' else ev['decision']+'  ·  '+ui.brief(ev))
  self.results.delete(*self.results.get_children())
  for i,m in enumerate(ev['matches']):self.results.insert('','end',iid=str(i),values=(m['character'],m['rank'] or '—',m['score'] if m.get('score') is not None else '不评分',ui.gate_brief(m)))
  if ev['matches']:self.results.selection_set('0');self.show_detail()
  else:
   self.detail.configure(state='normal');self.detail.delete('1.0','end')
   if ev.get('matches5'):self.detail.insert('end','六星探员未推荐此心锚；五星推荐见“详细依据”的五星页（优先级低于六星，仅供参考）。')
   else:self.detail.insert('end','当前没有探员推荐此心锚。数值质量与直接保留独立判断。')
   self.detail.configure(state='disabled')
 def show_detail(self):
  return ui.show_detail(self)

 def capture(self):
  if not self.model:return
  self.stop_event.clear();self.run('正在读取游戏当前心锚…',lambda:capture_current(ROOT,self.model,self.stop_event),self.accept_obs)
 def replay(self):
  if not self.model or self.busy:return
  paths=list((ROOT/'数据/历史记录').glob('*/results.json')) or list((ROOT/'数据/整理记录').glob('*/results.json'))
  if not paths:messagebox.showinfo('没有记录','请先完成一次扫描，或导入游戏截图。');return
  source=max(paths,key=lambda p:p.stat().st_mtime);policy=self.policy()
  selected=None if self.agent.get()=='全部探员' else [self.agent.get()]
  self.batch_records=[];self.history.delete(*self.history.get_children());self.stop_event.clear()
  def work():
   rows=archive_store.combined_records(ROOT,source.parent);count=0
   for row in rows:
    if self.stop_event.is_set():break
    old=row['observation'];obs=reparse_saved(old,self.model) if Path(old['image']).is_file() else old;ev=evaluate(self.model,obs,selected,policy)
    count+=1;self.events.put((dict(row,observation=obs,evaluation=ev,action='离线重评：'+ev['decision']),count))
   return count
  self.run('正在离线复核上轮记录…',work,lambda n:self.events.put((None,f'离线重新评分完成：{n} 件，未操作游戏。')))
 def stop(self):
  if self.busy:self.stop_event.set();self.status.set('已请求停止，不再发送新的游戏输入；等待当前识别退出。')
 def start(self,apply_marks=True):
  if not self.model or self.busy:return
  try:
   p=self.policy();limit=int(self.limit.get())
   if not 1<=limit<=3000:raise ValueError('数量上限应为1—3000')
  except Exception as e:messagebox.showerror('设置错误',str(e));return
  self.stop_event.clear();self.tabs.select(self.scan)
  self.batch_records=[];self.history.delete(*self.history.get_children());self.tabs.select(self.batchpage)
  selected=None if self.agent.get()=='全部探员' else [self.agent.get()]
  self.run('连接游戏，准备从顶部扫描全部心锚…',lambda:run_inventory(ROOT,self.model,p,selected,self.stop_event,lambda r,n:self.events.put((r,n)),True,limit,apply_marks=apply_marks,progress=lambda s:self.events.put((None,s))),
   self.finished_scan)
 def finished_scan(self,r):
  self.refresh_history();self.events.put((None,f'本轮结束：{r["count"]} 件。{r["reason"]}。截图、推荐探员和结果已保存，可载入历史查看。'))

if __name__=='__main__':
 if os.name=='nt':
  import ctypes
  ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('HeartAnchor.Terminal.'+VERSION)
 try:App().mainloop()
 except Exception:
  (ROOT/'日志').mkdir(exist_ok=True);(ROOT/'日志/startup-error.log').write_text(traceback.format_exc(),encoding='utf-8')
  try:messagebox.showerror('心锚适格评定终端启动失败',traceback.format_exc())
  except Exception:pass
