"""User-directed recovery. Opening this dialog never sends game input."""
import tkinter as tk
from tkinter import ttk,messagebox
from pathlib import Path
from PIL import Image,ImageTk
from resume_scan import latest_checkpoint
from automation import run_inventory
import app as base

def open_resume(a):
 if a.busy or not a.model:return
 state=latest_checkpoint(base.ROOT)
 if not state:messagebox.showinfo('没有可续扫记录','请先完成至少一件仓库扫描。');return
 if state.get('legacy'):state['selected']=None if a.agent.get()=='全部探员' else [a.agent.get()]
 w=tk.Toplevel(a);w.title('断点与手动续扫');w.geometry('780x500');w.minsize(650,450);w.configure(bg=base.BG)
 if hasattr(a,'app_icon'):w.iconphoto(True,a.app_icon)
 body=ttk.Frame(w,padding=18);body.pack(fill='both',expand=True)
 ttk.Label(body,text='从断点继续，不重新扫描顶部',style='Title.TLabel').pack(anchor='w')
 ttk.Label(body,text=f"已完成 {state['total_before']} 件 · 最后完成：{state['last_anchor']}").pack(anchor='w',pady=8)
 mode='按原规则锁定 / 标记放弃' if state['apply_marks'] else '只评分，不标记'
 ttk.Label(body,text='继续模式：'+mode,foreground=base.GOLD).pack(anchor='w')
 ttk.Label(body,text=('旧记录未保存探员范围，使用当前选择：' if state.get('legacy') else '沿用探员范围：')+('、'.join(state['selected']) if state.get('selected') else '全部探员')).pack(anchor='w')
 line=ttk.Frame(body);line.pack(fill='both',expand=True,pady=12)
 image_path=Path(state.get('last_image',''))
 if image_path.is_file():
  with Image.open(image_path) as im:
   im=im.crop((0,0,550,720));im.thumbnail((150,205));photo=ImageTk.PhotoImage(im)
  picture=ttk.Label(line,image=photo);picture.image=photo;picture.pack(side='left',padx=(0,16))
 info=ttk.Frame(line);info.pack(side='left',fill='both',expand=True)
 text=('自动续扫：游戏仍选中左图这件最后完成项时，点击下方按钮。程序校验选中框、详情、排序和仓库数量后，从下一件开始。\n\n'
       '手动校正：在游戏中选中第一件未处理的心锚，将它滚动到列表中间、完整露出，然后点击“从当前选中项开始”。该件也会处理。\n\n'
       '保持低等级优先排序。不要按名称判断相同物品的位置；无法确认起点时请取消。之前的记录会保留在列表里，新结果继续编号；历史记录可查看整个续扫链。')
 hint=ttk.Label(info,text=text,justify='left',wraplength=470);hint.pack(fill='x')
 info.bind('<Configure>',lambda event:hint.configure(wraplength=max(240,event.width-10)))
 def proceed(manual):
  if a.busy:return
  state['manual']=manual
  try:policy=state.get('policy') or a.policy();limit=int(a.limit.get())
  except Exception as ex:messagebox.showerror('设置错误',str(ex),parent=w);return
  if not 1<=limit<=3000:messagebox.showerror('设置错误','本轮数量应为1—3000',parent=w);return
  from history import combined_records
  try:prior=combined_records(base.ROOT,state['folder'])
  except Exception as ex:messagebox.showerror('无法读取此前记录',str(ex),parent=w);return
  offset=len(prior);state['total_before']=offset
  w.destroy();a.stop_event.clear();a.restore_scan_results(prior);a.tabs.select(a.batchpage)
  def done(result):
   a.finished_scan(result)
   a.events.put((None,f"仓库累计 {offset+result['count']} 件（此前 {offset} + 本次 {result['count']}）。{result['reason']}"))
  a.run('校验续扫起点…',lambda:run_inventory(base.ROOT,a.model,policy,state.get('selected'),a.stop_event,
    lambda row,n:a.events.put((row,offset+n)),max_items=limit,apply_marks=state['apply_marks'],progress=lambda msg:a.events.put((None,msg)),resume=state),done)
 footer=ttk.Frame(body);footer.pack(side='bottom',fill='x',before=line,pady=(10,0))
 ttk.Button(footer,text='从上次完成项之后继续',style='Accent.TButton',command=lambda:proceed(False)).pack(side='left')
 ttk.Button(footer,text='从当前选中项开始（手动）',command=lambda:proceed(True)).pack(side='left',padx=8)
 ttk.Button(footer,text='取消',command=w.destroy).pack(side='right')
