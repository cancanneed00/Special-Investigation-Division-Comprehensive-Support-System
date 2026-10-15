"""Focused native evidence viewer: one agent and recommendation at a time."""
import copy
import tkinter as tk
from tkinter import ttk
import app as theme

def recommendation_rows(e):
 eligible={(m['character'],m['rank']) for m in e.get('eligible_matches',[])}
 rows=[]
 for m in e.get('matches',[]):
  choices=m.get('alternatives') or [m]
  passed=[i for i,c in enumerate(choices) if (m['character'],c['rank']) in eligible]
  rows.append({'match':m,'choices':choices,'default':passed[0] if passed else 0,
               'status':'有达标方案' if passed else '需复核' if any(c.get('gate_pass') is None for c in choices) else '未达标',
               'eligible':bool(passed)})
 return sorted(rows,key=lambda r:(not r['eligible'],-r['match']['score']))

def number(v):return '未确定' if v is None else f'{v:g}'

def score_range(bounds):
 if not bounds:return '未确定'
 return number(bounds[0]) if bounds[0]==bounds[1] else number(bounds[0])+' — '+number(bounds[1])

def open_details(a):
 if not a.result:return
 e=copy.deepcopy(a.result);obs=copy.deepcopy(a.current_obs);rows=recommendation_rows(e)
 eligible={(m['character'],m['rank']) for m in e.get('eligible_matches',[])}
 w=tk.Toplevel(a);w.title('详细依据 · '+obs.get('anchor','心锚'));w.configure(bg=theme.BG)
 width=min(1040,w.winfo_screenwidth()-80);height=min(760,w.winfo_screenheight()-100)
 w.geometry(f'{width}x{height}');w.minsize(800,560)
 if hasattr(a,'app_icon'):w.iconphoto(True,a.app_icon)
 shell=ttk.Frame(w,padding=18);shell.pack(fill='both',expand=True)
 ttk.Label(shell,text=obs.get('anchor','心锚')+'  ·  '+e['decision'],style='Title.TLabel').pack(anchor='w')
 count=len({m['character'] for m in e.get('eligible_matches',[])})
 quality=number(e['value_score']) if e.get('value_score') is not None else score_range(e.get('value_range'))
 score=f"数值分 {quality}    /    最高匹配分 {number(e.get('match_score'))}    ·    {count} 位探员有达标方案"
 ttk.Label(shell,text=score,foreground=theme.GOLD).pack(anchor='w',pady=(5,12))
 tabs=ttk.Notebook(shell);tabs.pack(fill='both',expand=True)
 match=ttk.Frame(tabs,padding=12);value=ttk.Frame(tabs,padding=12);reason=ttk.Frame(tabs,padding=12)
 tabs.add(match,text='探员与推荐方案');tabs.add(value,text='数值质量');tabs.add(reason,text='处理结论')

 def text_area(parent):
  frame=ttk.Frame(parent);frame.pack(fill='both',expand=True)
  t=tk.Text(frame,wrap='word',bg=theme.PANEL,fg=theme.FG,insertbackground=theme.FG,
            relief='flat',borderwidth=0,padx=16,pady=12,font=('Microsoft YaHei UI',10),spacing3=6)
  sb=ttk.Scrollbar(frame,command=t.yview);sb.pack(side='right',fill='y');t.configure(yscrollcommand=sb.set)
  t.pack(fill='both',expand=True)
  for tag,color,font in [('heading',theme.GOLD,('Microsoft YaHei UI',12,'bold')),('label',theme.FG,('Microsoft YaHei UI',10,'bold')),('muted',theme.MUTED,('Microsoft YaHei UI',10)),('pass','#8ed8b3',('Microsoft YaHei UI',10,'bold')),('fail','#f5b594',('Microsoft YaHei UI',10,'bold'))]:
   t.tag_configure(tag,foreground=color,font=font)
  t.configure(state='disabled');return t

 match.columnconfigure(1,weight=1);match.rowconfigure(0,weight=1)
 left=ttk.Frame(match,padding=(0,0,14));left.grid(row=0,column=0,sticky='nsew')
 ttk.Label(left,text=f'推荐探员 · {len(rows)} 人',style='Section.TLabel').pack(anchor='w')
 ttk.Label(left,text='达标优先；点击姓名查看对应方案',foreground=theme.MUTED).pack(anchor='w',pady=(4,8))
 listing=ttk.Frame(left);listing.pack(fill='both',expand=True)
 tree=ttk.Treeview(listing,columns=('agent','score','state'),show='headings',selectmode='browse',height=9)
 for key,title,size in [('agent','探员',100),('score','最高分',60),('state','保留条件',90)]:
  tree.heading(key,text=title);tree.column(key,width=size,minwidth=size,stretch=False)
 sb=ttk.Scrollbar(listing,command=tree.yview);sb.pack(side='right',fill='y');tree.configure(yscrollcommand=sb.set);tree.pack(fill='both',expand=True)
 tree.tag_configure('eligible',foreground='#8ed8b3')
 right=ttk.Frame(match);right.grid(row=0,column=1,sticky='nsew')
 name=tk.StringVar(value='暂无推荐探员');ttk.Label(right,textvariable=name,style='Section.TLabel').pack(anchor='w')
 chooser=ttk.Combobox(right,state='readonly');chooser.pack(fill='x',pady=(8,10))
 body=text_area(right);active=[None]
 def render_choice(event=None):
  row=active[0]
  if row is None:return
  c=row['choices'][max(0,chooser.current())];m=row['match'];ok=(m['character'],c['rank']) in eligible
  body.configure(state='normal');body.delete('1.0','end')
  body.insert('end',('满足推荐保留' if ok else '未满足推荐保留')+f"  ·  匹配 {number(c['score'])} 分\n",'pass' if ok else 'fail')
  threshold=e.get('policy',{}).get('keep',{}).get('match_threshold')
  if threshold is not None:body.insert('end',f'本次匹配门槛：{number(threshold)} 分；还需满足下列档位条件。\n\n','muted')
  checks={x['label']:x for x in c.get('gate_checks',[])}
  for d in c.get('details',[]):
   if d['label'].startswith('特性'):continue
   actual=obs.get('entries',{}).get(d['label'].replace('词条','')) or {}
   magnitude=str(actual.get('value',''))+('%' if actual.get('unit')=='percent' else '')
   body.insert('end',d['label']+'  ·  '+d['actual']+' '+magnitude+'\n','label')
   body.insert('end','推荐：'+d['recommend']+'\n')
   check=checks.pop(d['label'],None)
   if check:
    state='通过' if check['pass'] is True else '未通过' if check['pass'] is False else '待复核'
    explanation=check['reason'].replace('；单条低档不触发放弃','')
    body.insert('end',state+'：'+explanation+'\n','pass' if check['pass'] is True else 'fail')
   body.insert('end','\n')
  for check in checks.values():body.insert('end',check['label']+'：'+check['reason']+'\n','muted')
  traits=[d for d in c.get('details',[]) if d['label'].startswith('特性')]
  if traits:
   body.insert('end','特性 · 仅供参考，不计分\n','heading')
   for d in traits:body.insert('end',d['label']+'：'+d['actual']+'；推荐 '+d['recommend']+'\n','muted')
  if m.get('note'):body.insert('end','\n配装备注\n','heading');body.insert('end',m['note']+'\n','muted')
  body.configure(state='disabled');body.yview_moveto(0)
 def select_person(event=None):
  selected=tree.selection()
  if not selected:return
  row=rows[int(selected[0])];active[0]=row;name.set(row['match']['character'])
  chooser['values']=[f"方案 {c['rank']}  ·  {number(c['score'])} 分  ·  "+('达标' if (row['match']['character'],c['rank']) in eligible else '未达标') for c in row['choices']]
  chooser.current(row['default']);render_choice()
 tree.bind('<<TreeviewSelect>>',select_person);chooser.bind('<<ComboboxSelected>>',render_choice)
 for i,row in enumerate(rows):
  m=row['match'];tree.insert('','end',iid=str(i),values=(m['character'],number(m['score']),row['status']),tags=('eligible',) if row['eligible'] else ())
 if rows:tree.selection_set('0');select_person()
 else:
  chooser.configure(state='disabled');body.configure(state='normal');body.insert('end','此心锚没有可显示的推荐方案。请查看数值质量和处理结论。','muted');body.configure(state='disabled');tabs.select(reason)

 t=text_area(value);t.configure(state='normal');t.insert('end','数值质量独立计算\n','heading')
 t.insert('end','只看词条数量和数值接近满值的程度，不看适合哪位探员。\n\n','muted')
 for d in e.get('value_details',[]):
  unit='%' if d.get('unit')=='percent' else ''
  t.insert('end',f"词条 {d['position']}  ·  {d['stat']}  {d['value']}{unit}\n",'label')
  t.insert('end',f"档位：{d['tier']}    单条质量：{score_range(d['score_range'])} 分\n\n")
 if e.get('value_range'):t.insert('end',f"整体数值分：{score_range(e['value_range'])}\n")
 for note in e.get('value_notes',[]):t.insert('end',str(note)+'\n','muted')
 t.insert('end','\n计算公式\n','heading');t.insert('end','100 × Σ（词条权重 × 当前值 / 满值）/ Σ权重 × min(1,词条数/3)\n权重：40% / 30% / 20% / 10%。缺失词条不占权重；2条及以下有缺条折扣。','muted');t.configure(state='disabled')
 t=text_area(reason);t.configure(state='normal');t.insert('end',e['decision']+'\n','heading')
 for item in e.get('reasons',[]):t.insert('end','• '+item+'\n\n')
 t.insert('end','阅读提示\n','heading');t.insert('end','“有达标方案”表示该探员至少一个推荐方案同时满足匹配和档位要求。最高匹配分对应的方案不一定达标；默认展示达标方案。\n\n高数值直接保留与探员推荐独立，可能没有达标探员。此处显示的是评估结论，实际锁定或放弃状态以历史表的处理结果为准。','muted');t.configure(state='disabled')
 ttk.Button(shell,text='关闭',command=w.destroy).pack(side='bottom',anchor='e',pady=(12,0),before=tabs)
 w.bind('<Escape>',lambda event:w.destroy())
