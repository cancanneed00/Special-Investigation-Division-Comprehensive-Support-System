from pathlib import Path
p=Path(__file__).parent
f=p/'ui_v4.py';s=f.read_text(encoding='utf-8')
start=s.index('def build_scan(a):');end=s.index('\ndef build_catalog',start)
s=s[:start]+'''def build_scan(a):
 body=ttk.Frame(a.scan);body.pack(fill='both',expand=True)
 bar=ttk.Frame(body);bar.pack(fill='x',pady=(0,8))
 a.capturebtn=ttk.Button(bar,text='识别当前 · 1 / 30级',style='Accent.TButton',command=a.capture);a.capturebtn.pack(side='left')
 a.ocrbtn=ttk.Button(bar,text='导入截图',command=a.choose_image);a.ocrbtn.pack(side='left',padx=4)
 a.scorebtn=ttk.Button(bar,text='重算',command=a.calculate);a.scorebtn.pack(side='left')
 a.agent=ttk.Combobox(bar,state='readonly',width=12,values=['全部探员']);a.agent.current(0);a.agent.pack(side='right');a.agent.bind('<<ComboboxSelected>>',lambda e:a.calculate())
 ttk.Button(bar,text='评分公式',command=lambda:a.tabs.select(a.info)).pack(side='right',padx=4)
 row=ttk.Frame(body);row.pack(fill='x')
 a.picture=tk.Label(row,bg=base.PANEL,fg=base.MUTED,text='等待截图',width=18,height=9);a.picture.pack(side='left',padx=(0,12))
 fields=ttk.Frame(row);fields.pack(side='left',fill='both',expand=True)
 a.titlevar=tk.StringVar(value='选择游戏中的心锚，再点击识别');label(fields,variable=a.titlevar,style='Title.TLabel')
 a.scoresvar=tk.StringVar(value='数值分 —    匹配分 —');label(fields,variable=a.scoresvar,color=base.GOLD)
 a.fields=ttk.Treeview(fields,columns=['p','s','v','t'],show='headings',height=4)
 for key,title,width in [('p','词条',45),('s','属性',140),('v','数值',85),('t','档位',150)]:
  a.fields.heading(key,text=title);a.fields.column(key,width=width,minwidth=40,stretch=key in ('s','t'))
 a.fields.pack(fill='x')
 a.traitvar=tk.StringVar();label(fields,variable=a.traitvar,color=base.MUTED)
 a.decision=tk.StringVar(value='识别后显示结论；双击推荐或点“详细依据”查看完整解释。');label(body,variable=a.decision,color=base.GOLD)
 bar=ttk.Frame(body);bar.pack(fill='x',pady=4)
 ttk.Label(bar,text='推荐探员',style='Section.TLabel').pack(side='left')
 ttk.Button(bar,text='详细依据 ↗',command=lambda:open_details(a)).pack(side='right')
 ttk.Button(bar,text='导出记录',command=a.export).pack(side='right',padx=4)
 a.results=table(body,[('char','探员',110),('rank','方案',60),('score','匹配分',75),('reason','关键条件',350)],3)
 a.results.bind('<<TreeviewSelect>>',lambda e:a.show_detail());a.results.bind('<Double-1>',lambda e:open_details(a))
 a.detail=tk.Text(body) # Full explanation is available on demand, never nested in the page.
 bar=ttk.Frame(body);bar.pack(fill='x',pady=(8,0))
 a.batchbtn=ttk.Button(bar,text='仓库 · 只评分',command=lambda:a.start(False));a.batchbtn.pack(side='left')
 a.startbtn=ttk.Button(bar,text='仓库 · 按规则标记',style='Accent.TButton',command=lambda:a.start(True));a.startbtn.pack(side='left',padx=6)
 ttk.Button(bar,text='停止 · 回车',command=a.stop).pack(side='left')
 ttk.Label(bar,text='批量仅1级 · 不解离',foreground=base.MUTED).pack(side='right')

def brief(ev):
 reasons=ev.get('reasons',[])
 if ev.get('decision')=='锁定':
  eligible=ev.get('eligible_matches',[])
  if any('直接保留' in r for r in reasons):return '高数值直接保留'
  return ('适合 '+ '、'.join(dict.fromkeys(m['character'] for m in eligible))[:32]+' · 档位达标') if eligible else '达到保留条件'
 if ev.get('decision')=='标记放弃':return (reasons[-1] if reasons else '低质量筛选').split('（')[0]
 if ev.get('decision')=='跳过复核':return '待复核：'+(reasons[0] if reasons else '识别不确定')[:44]
 return '匹配达标但档位不足' if any('匹配分达标' in r for r in reasons) else (reasons[0][:44] if reasons else '处于保留与放弃之间')

def gate_brief(m):
 if m.get('gate_pass') is True:return '档位通过'
 failed=[c['label']+('待复核' if c['pass'] is None else '未达标') for c in m.get('gate_checks',[]) if c['pass'] is not True]
 return ' / '.join(failed) or '待复核'

def open_details(a):
 if not a.result:return
 w=tk.Toplevel(a);w.title('评分依据 · '+a.current_obs['anchor']);w.geometry('740x620');w.minsize(500,400)
 if hasattr(a,'app_icon'):w.iconphoto(True,a.app_icon)
 f,t=a.text_widget(w);f.pack(fill='both',expand=True,padx=12,pady=12)
 e=a.result;t.configure(state='normal');t.insert('end',a.titlevar.get()+'\\n'+a.scoresvar.get()+'\\n\\n','heading')
 t.insert('end','\\n'.join(e['reasons'])+'\\n\\n')
 for d in e['value_details']:t.insert('end',f"词条{d['position']} · {d['stat']} {d['value']} · {d['tier']} · 单条质量 {d['score_range']}\\n")
 t.insert('end','\\n'+a.detail.get('1.0','end'));t.configure(state='disabled')

''' +s[end:]
# One scrollable result list, no always-visible horizontal bar.
s=s.replace("t.column(key,width=width,minwidth=60)","t.column(key,width=width,minwidth=40,stretch=key in ('reason','char'))")
s=s.replace(" x=ttk.Scrollbar(f,orient='horizontal',command=t.xview);x.pack(side='bottom',fill='x')\n t.configure(yscrollcommand=y.set,xscrollcommand=x.set);t.pack(fill='both',expand=True);return t", " t.configure(yscrollcommand=y.set);t.pack(fill='both',expand=True);return t")
start=s.index('def build_policy(a):');end=s.index('\nHELP=',start)
s=s[:start]+'''def build_policy(a):
 body=ttk.Frame(a.rulespage);body.pack(fill='both',expand=True)
 label(body,'规则在下一次评分或扫描时生效。先保留，再筛出；不确定的记录进入复核。',color=base.MUTED)
 try:saved=validate_policy(json.loads(a.store.config.read_text(encoding='utf-8')).get('policy',DEFAULT_POLICY))
 except Exception:saved=validate_policy(DEFAULT_POLICY)
 columns=ttk.Frame(body);columns.pack(fill='both',expand=True);columns.columnconfigure((0,1),weight=1,uniform='rules')
 fields={'keep':[('perfect_threshold','数值 > 此值直接保留',0,100),('match_threshold','推荐匹配 ≥',0,100),('max_tier','重要词条：前几档',1,2),('ordinary_tier','普通 / 皆可：前几档',1,3),('min_bottom_tiers','min：最低几档',1,2)],'discard':[('min_entries','词条少于',2,4),('worst_tier','全低档起点',4,6),('joint_value','联合筛选：数值 <',0,100),('joint_match','且匹配 <',0,100),('weak_value','整体低数值 <',0,100)]}
 for col,(kind,title) in enumerate([('keep','保留条件'),('discard','放弃条件')]):
  group=ttk.Frame(columns,padding=(8,4,16,4));group.grid(row=0,column=col,sticky='nsew');label(group,title,style='Section.TLabel')
  data=saved[kind];d={};a.policyvars[kind]=d
  switches=([('perfect_enabled','高数值直留'),('enabled','推荐达标保留')] if kind=='keep' else [('enabled','启用放弃'),('count_enabled','缺条'),('low_enabled','全低档'),('joint_enabled','低匹配联合筛选'),('weak_enabled','整体低数值筛选')])
  checks=ttk.Frame(group);checks.pack(fill='x',pady=4)
  for n,(key,text) in enumerate(switches):
   d[key]=tk.BooleanVar(value=data[key]);ttk.Checkbutton(checks,text=text,variable=d[key]).grid(row=n//2,column=n%2,sticky='w',padx=(0,10),pady=2)
  for key,text,low,high in fields[kind]:
   row=ttk.Frame(group);row.pack(fill='x',pady=3);d[key]=tk.StringVar(value=str(data[key]))
   ttk.Label(row,text=text).pack(side='left');ttk.Spinbox(row,from_=low,to=high,textvariable=d[key],width=6).pack(side='right')
  label(group,'参考：数值>95，或匹配≥80且档位通过。重要前2档；普通前3档；min最低2档。' if kind=='keep' else '参考：数值<95且匹配<70；或未达保留且数值<85。有效min及推荐保留优先；单条普通低档不直接放弃。',color=base.MUTED)
 a.scrollvar=tk.BooleanVar(value=True);a.limit=tk.StringVar(value='3000')
 bar=ttk.Frame(body);bar.pack(fill='x',pady=6)
 ttk.Label(bar,text='本轮上限').pack(side='left');ttk.Entry(bar,textvariable=a.limit,width=6).pack(side='left',padx=6)
 ttk.Button(bar,text='恢复参考值',command=lambda:reset_policy(a)).pack(side='right')
 ttk.Button(bar,text='保存规则',style='Accent.TButton',command=a.save_policy).pack(side='right',padx=6)
 label(body,'仓库仅1级，已有锁定保持。截图保留7天 / 300MB；结果摘要保留。',color=base.MUTED)

def reset_policy(a):
 for kind,fields in a.policyvars.items():
  for key,v in fields.items():v.set(DEFAULT_POLICY[kind][key])
 a.status.set('已恢复参考值；点击保存规则可持久保存。')

''' +s[end:]
s=s.replace('只支持1级心锚；强化后的数值不套用1级表。','单件支持1级、30级，分别读取原表对应等级列；批量仅处理1级。其他等级不插值。')
s=s.replace("HELP=[", "HELP=[('评分公式与参考阈值','数值 Q = 100 × Σ(wᵢ × 当前值ᵢ/对应等级满值ᵢ) / Σwᵢ × min(1,词条数/3)。w = 0.4、0.3、0.2、0.1，仅对存在的词条求和；第四词条存在即满档。\\n匹配 M = 100 × Σ(词条权重 × 偏好符合度) / Σ词条权重，与实际数值独立；每个推荐方案分别计算。\\n先处理缺条和不确定项，再保留高数值或推荐达标心锚。其余：Q<95 且 M<70，或 Q<85，建议放弃；全低档规则仍独立生效。等于阈值不触发“低于”。无推荐时联合筛选按M=0。\\n参考值是基于历史记录对比的规则建议，并非经人工标注训练的模型；可在规则页修改。单条普通词条低档本身不是放弃依据。'),")
f.write_text(s,encoding='utf-8')

f=p/'desktop.py';s=f.read_text(encoding='utf-8')
s=s.replace("  self.minsize(960,680)","  self.minsize(960,680)\n  icon=Path(__file__).parent/'assets/app.png'\n  if icon.exists():\n   self.app_icon=ImageTk.PhotoImage(Image.open(icon));self.iconphoto(True,self.app_icon)\n   self.iconbitmap(str(icon.with_suffix('.ico')))")
s=s.replace("self.history.column(c,width=w)","self.history.column(c,width=w,minwidth=40,stretch=c in ('name','reason'))")
s=s.replace("('action','处理结果',145),('reason','原因 / 评分依据',320)","('action','结果',125),('reason','关键依据',250)")
s=s.replace("  xs=ttk.Scrollbar(self.batchpage,orient='horizontal',command=self.history.xview);xs.pack(side='bottom',fill='x');self.history.configure(xscrollcommand=xs.set,height=7)","  self.history.configure(height=7)")
s=s.replace("self.history.bind('<<TreeviewSelect>>',self.select_history)","self.history.bind('<<TreeviewSelect>>',self.select_history);self.history.bind('<Double-1>',lambda e:ui.open_details(self))")
s=s.replace("  f,self.historydetail=self.text_widget(preview);self.historydetail.configure(height=9);f.pack(side='left',fill='both',expand=True)","  self.historycaption=tk.StringVar(value='选择结果查看截图与关键依据；双击查看完整详情。')\n  info=ttk.Frame(preview);info.pack(side='left',fill='both',expand=True)\n  ui.label(info,variable=self.historycaption)\n  ttk.Button(info,text='详细依据 ↗',command=lambda:ui.open_details(self)).pack(anchor='w')")
s=s.replace("explanation='；'.join(e['reasons']+e.get('value_notes',[]))","explanation=ui.brief(e)")
s=s.replace("row['action'],explanation", "row['action'].replace('已锁定，保留原状态','已锁定').replace('历史重评：','').replace('离线重评：',''),explanation")
s=s.replace("width=260,height=180", "width=150,height=165")
start=s.index("   t=self.historydetail;");end=s.index('\n def accept_model',start)
s=s[:start]+"   self.historycaption.set(r['observation']['anchor']+'  ·  '+e['decision']+'  ·  数值 '+score_text(e['value_score'],e['value_range'])+' / 匹配 '+score_text(e['match_score'])+'\\n'+ui.brief(e)+'\\n满足推荐保留：'+names)"+s[end:]
s=s.replace("im.thumbnail((260,190))","im.thumbnail((150,195))")
s=s.replace("self.picture.configure(image=self.preview,text='',width=260,height=190)","self.picture.configure(image=self.preview if self.preview else '',text='' if self.preview else '截图已清理',width=150,height=195)")
s=s.replace("ev['decision']+'  ·  '+'；'.join(ev['reasons']+normalized+ev.get('value_notes',[]))", "ev['decision']+'  ·  '+ui.brief(ev)")
s=s.replace("m['score'],m['reason']", "m['score'],ui.gate_brief(m)")
s=s.replace("self.summary.set(f'{m[\"filename\"]}  ·  {len(m[\"characters\"])} 名探员 / {len(m[\"anchors\"])} 种心锚 / {len(m[\"rules\"])} 行数值规则')", "self.summary.set(f'{len(m[\"characters\"])} 名探员  ·  {len(m[\"anchors\"])} 种心锚  ·  1 / 30级数值表  ·  原表说明见评分公式')")
f.write_text(s,encoding='utf-8')

f=p/'app.py';s=f.read_text(encoding='utf-8')
s=s.replace("'#111823';PANEL='#1b2635';FG='#eef3fa';MUTED='#a5b5c8';GOLD='#80c4ff';BORDER='#2c4056'", "'#171725';PANEL='#222236';FG='#f0eef8';MUTED='#b0abc6';GOLD='#c8b5ff';BORDER='#38344f'")
s=s.replace("23,'bold'", "16,'bold'").replace("rowheight=36", "rowheight=29").replace("background='#245e86'", "background='#655294'")
s=s.replace("padding=(24,10)","padding=(16,7)").replace("padding=(24,16,24,8)","padding=(16,8,16,5)").replace("padding=(24,0,24,12)","padding=(16,0,16,5)").replace("padding=(24,0,24,10)","padding=(16,0,16,5)").replace("padx=24,pady=(0,10)","padx=16,pady=(0,6)")
s=s.replace("st.configure('TButton'", "st.configure('Section.TLabel',font=('Microsoft YaHei UI',11,'bold'),foreground=GOLD)\n        st.configure('TCheckbutton',background=BG,foreground=FG,indicatorbackground=PANEL)\n        st.configure('TButton'",1)
f.write_text(s,encoding='utf-8')
