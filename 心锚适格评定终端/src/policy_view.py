"""Detailed native policy editor and decision sandbox; never sends game input."""
import json, math
import tkinter as tk
from tkinter import ttk
from scoring import DEFAULT_POLICY, validate_policy, decide, quality_filter, tier_pass

def simulate(policy, q, m, count, tiers, roles, uncertain=False):
 p=validate_policy(policy);q=float(q);m=float(m);count=int(count)
 if not all(math.isfinite(x) and 0<=x<=100 for x in (q,m)) or not 2<=count<=4:
  raise ValueError('分数须为0—100，词条数量须为2—4。')
 obs={'entries':{},'presence':{}};evidence={};checks=[]
 for i in range(1,5):
  key=str(i)
  if i>count:obs['presence'][key]='absent';continue
  tier=int(tiers[i-1]);role=roles[i-1]
  if not 1<=tier<=6:raise ValueError('档位须为1—6。')
  if i==4:tier=1
  obs['entries'][key]={'stat':'示例词条'}
  e={'tiers':[tier],'candidates':[{'tiers':[tier],'last':1 if i==4 else 6}]};evidence[key]=e
  cut=p['keep']['min_bottom_tiers'] if role=='min' else p['keep']['max_tier'] if role=='重要' else p['keep']['ordinary_tier']
  ok=tier_pass(e,cut,'min' if role=='min' else 'max')
  checks.append(f'词条{i} · {role} · 第{tier}档：'+('通过' if ok else '未通过'))
 gate=all('：通过' in c for c in checks)
 choices=[{'score':m,'gate_pass':gate,'character':'示例探员','reason':'；'.join(checks)}]
 quality=quality_filter(obs,evidence,p['discard'])
 result,reason=decide(quality,choices,p,['模拟识别不确定'] if uncertain else [],[q,q])
 return result,reason,checks

def build_policy(a):
 import ui_v4 as ui
 import app as base
 root=a.rulespage
 try:saved=validate_policy(json.loads(a.store.config.read_text(encoding='utf-8')).get('policy',DEFAULT_POLICY))
 except Exception:saved=validate_policy(DEFAULT_POLICY)
 a.policyvars={kind:{key:(tk.BooleanVar(value=value) if isinstance(value,bool) else tk.StringVar(value=str(value))) for key,value in saved[kind].items()} for kind in ('keep','discard')}
 ui.label(root,'整理规则  /  保留 · 放弃 · 先试算',style='Section.TLabel')
 ui.label(root,'当前编辑值用于下次评分；保存后重启仍保留。续扫沿用断点原规则，不会中途切换。',color=base.MUTED)
 footer=ttk.Frame(root);footer.pack(side='bottom',fill='x',pady=(8,0))
 a.scrollvar=tk.BooleanVar(value=True);a.limit=tk.StringVar(value='3000')
 ttk.Label(footer,text='本轮上限').pack(side='left');ttk.Entry(footer,textvariable=a.limit,width=6).pack(side='left',padx=6)
 saved_note=tk.StringVar(value='参考值可修改；不会自动操作游戏')
 ttk.Label(footer,textvariable=saved_note,foreground=base.GOLD).pack(side='left',padx=8)
 def save():
  try:a.policy()
  except Exception as e:saved_note.set(str(e));return
  a.save_policy()
  if a.status.get()=='规则已保存':saved_note.set('已保存')
 ttk.Button(footer,text='保存规则',style='Accent.TButton',command=save).pack(side='right')
 ttk.Button(footer,text='恢复参考值',command=lambda:ui.reset_policy(a)).pack(side='right',padx=8)
 tabs=ttk.Notebook(root);tabs.pack(fill='both',expand=True)
 pages=[]
 for title in ('① 保留条件','② 放弃条件','③ 模拟与说明'):
  page=ttk.Frame(tabs);tabs.add(page,text=title);pages.append(ui.scroll_page(page))
 def section(parent,kind,key,title,explain,fields):
  box=ui.card(parent,title);ui.toggle(box,'启用此条件',a.policyvars[kind][key])
  controls=[]
  for name,caption,lo,hi,hint in fields:
   row=ttk.Frame(box);row.pack(fill='x',pady=4)
   ttk.Label(row,text=caption).pack(side='left')
   spin=ttk.Spinbox(row,from_=lo,to=hi,increment=1,textvariable=a.policyvars[kind][name],width=7,font=('Microsoft YaHei UI',12));spin.pack(side='left',padx=14);controls.append(spin)
   ui.label(box,hint,color=base.MUTED)
  ui.label(box,explain)
  def enabled(*_):
   on=a.policyvars[kind][key].get() and (kind!='discard' or a.policyvars['discard']['enabled'].get())
   for control in controls:control.configure(state='normal' if on else 'disabled')
  a.policyvars[kind][key].trace_add('write',enabled)
  if kind=='discard':a.policyvars['discard']['enabled'].trace_add('write',enabled)
  enabled()
 section(pages[0],'keep','perfect_enabled','A  高数值直接保留','只看数值分 Q，不要求推荐匹配。识别不确定、或先命中已启用的缺条规则时，不会走到此条件。',[
  ('perfect_threshold','数值分 Q  >',0,100,'参考 95：95 分不触发，95.01 分才触发；提高阈值会减少直接保留。')])
 section(pages[0],'keep','enabled','B  推荐达标保留','任一探员的任一推荐方案同时满足匹配分和所有适用档位条件，即可保留。红字必须匹配；特性不参与门槛。',[
  ('match_threshold','推荐匹配分 M  ≥',0,100,'参考 80：按每个推荐方案分别判断，不能把不同探员的达标词条拼在一起。'),
  ('max_tier','重要词条：前几档',1,2,'参考 2：第1、2档通过。红字 / 加粗重要词条还必须匹配属性。'),
  ('ordinary_tier','普通 / 不重要 / 皆可：前几档',1,3,'参考 3：第4—6档使该方案不满足保留，但不会仅因此直接放弃。'),
  ('min_bottom_tiers','min：最低几档',1,2,'参考 2：若表中共有6档，第5、6档通过；按实际表格档数倒数，不是固定写死5、6档。')])
 ui.label(pages[1],'放弃总开关',style='Section.TLabel');ui.toggle(pages[1],'允许标记放弃',a.policyvars['discard']['enabled'])
 ui.label(pages[1],'以下条件为“或”关系；联合筛选内部为“且”。先检查缺条，再判断保留，其余才进入数值筛选。',color=base.GOLD)
 section(pages[1],'discard','count_enabled','① 缺少太多词条 · 优先检查','仅在词条空缺已确认时触发。默认2条及以下放弃；3条不会只因缺第4条放弃。',[
  ('min_entries','现有词条数量  <',2,4,'参考 3。此规则优先于高数值直留和推荐保留。')])
 section(pages[1],'discard','low_enabled','② 全部词条低档','所有现有词条都在此档或更低时触发。单条普通 / 不重要词条差，不满足“全部”。',[
  ('worst_tier','全部词条档号  ≥',4,6,'参考 4：全部为第4、5、6档。第1档最好；第4词条存在即第1档。')])
 section(pages[1],'discard','joint_enabled','③ 低匹配 + 数值不突出','两个分数必须同时低于阈值。已有有效推荐 / min 方案时，受到保护，不走联合筛选。无推荐时 M 按0计算。',[
  ('joint_value','数值分 Q  <',0,100,'参考 95；提高此值会扩大放弃范围。'),('joint_match','并且匹配分 M  <',0,100,'参考 70；恰好等于阈值不会命中这一条件。')])
 section(pages[1],'discard','weak_enabled','④ 整体数值偏低','未满足有效推荐保留且整体数值过低时触发；有效 min 方案受保护。此项与联合筛选是“或”的关系。',[
  ('weak_value','数值分 Q  <',0,100,'参考 85。关闭此项后，仍可能因缺条、全低档或联合筛选被放弃。')])
 sim=pages[2]
 ui.label(sim,'决策试算 · 使用当前编辑规则',style='Section.TLabel')
 ui.label(sim,'这是规则边界示例，不是虚构游戏实物：Q、M 作为已经算出的分数输入，档位另设。假定属性均匹配、无红字冲突、只有一个推荐方案；真实评分仍以表格和截图为准。',color=base.MUTED)
 result=tk.StringVar();reason=tk.StringVar();detail=tk.StringVar()
 banner=ui.card(sim,'试算结果');result_label=ui.label(banner,variable=result,style='Section.TLabel');ui.label(banner,variable=reason);ui.label(banner,variable=detail,color=base.MUTED)
 q=tk.StringVar(value='90');m=tk.StringVar(value='85');count=tk.StringVar(value='3');uncertain=tk.BooleanVar(value=False)
 tiers=[tk.StringVar(value=str(x)) for x in (2,2,3,1)];roles=[tk.StringVar(value=x) for x in ('重要','重要','普通','普通')]
 controls=ttk.Frame(sim);controls.pack(fill='x',pady=8)
 for text,var,lo,hi in [('Q 数值',q,0,100),('M 匹配',m,0,100),('词条数量',count,2,4)]:
  ttk.Label(controls,text=text).pack(side='left',padx=(0,5));ttk.Spinbox(controls,from_=lo,to=hi,textvariable=var,width=6).pack(side='left',padx=(0,15))
 for i in range(4):
  row=ttk.Frame(sim);row.pack(fill='x',pady=3);ttk.Label(row,text=f'词条 {i+1}',width=9).pack(side='left')
  ttk.Combobox(row,textvariable=roles[i],values=['重要','普通','min'],state='readonly',width=9).pack(side='left',padx=5)
  ttk.Label(row,text='档号').pack(side='left',padx=8)
  ttk.Combobox(row,textvariable=tiers[i],values=[1] if i==3 else list(range(1,7)),state='readonly',width=5).pack(side='left')
  ttk.Label(row,text='存在时固定第1档' if i==3 else '1最好，6最低（示例为6档）',foreground=base.MUTED).pack(side='left',padx=12)
 ttk.Checkbutton(sim,text='模拟识别不确定（应待复核）',variable=uncertain).pack(anchor='w',pady=6)
 def refresh(*_):
  try:
   decision,why,checks=simulate(a.policy(),q.get(),m.get(),count.get(),[x.get() for x in tiers],[x.get() for x in roles],uncertain.get())
   result.set(decision+'  ·  仅试算');reason.set(why);detail.set('   /   '.join(checks));result_label.configure(foreground='#8fdfb0' if decision=='锁定' else '#ffaaa0' if decision=='标记放弃' else base.GOLD)
  except (ValueError,tk.TclError) as e:result.set('请补全有效参数');reason.set(str(e));detail.set('')
 presets={'推荐达标':(90,85,3,[2,2,3,1],['重要','重要','普通','普通']), '高数值直留':(96,50,3,[2,2,3,1],['重要','重要','普通','普通']), '低匹配放弃':(90,50,3,[2,2,3,1],['重要','重要','普通','普通']), 'min低值保留':(75,90,3,[6,2,3,1],['min','重要','普通','普通']), '仅两条':(65,100,2,[1,1,1,1],['重要','重要','普通','普通']), '恰好95分':(95,50,3,[2,2,3,1],['重要','重要','普通','普通'])}
 chooser=tk.StringVar(value='推荐达标');row=ttk.Frame(sim);row.pack(fill='x',pady=8)
 ttk.Label(row,text='载入例子').pack(side='left');combo=ttk.Combobox(row,textvariable=chooser,values=list(presets),state='readonly',width=20);combo.pack(side='left',padx=8)
 def example(*_):
  v=presets[chooser.get()];q.set(v[0]);m.set(v[1]);count.set(v[2]);uncertain.set(False)
  for i in range(4):tiers[i].set(v[3][i]);roles[i].set(v[4][i])
  refresh()
 combo.bind('<<ComboboxSelected>>',example)
 ui.label(sim,'判断顺序：识别不确定 → 缺条 → 高数值直留 → 推荐保留 / 档位待复核 → 全低档 → 联合或整体低数值 → 不标记。关闭推荐保留后，有效推荐仍能阻止联合及整体低数值筛选，但不能阻止缺条 / 全低档规则。',color=base.GOLD)
 for title,text in ui.HELP[:1]+[ui.HELP[3],ui.HELP[4]]:ui.label(ui.card(sim,title),text)
 ui.label(sim,'试算不会保存设置或点击游戏。实际执行还会跳过1、2星，仓库仅处理1级，已有锁定保持；单件可识别30级。')
 for var in [q,m,count,uncertain]+tiers+roles:var.trace_add('write',refresh)
 for group in a.policyvars.values():
  for var in group.values():var.trace_add('write',lambda *_:(saved_note.set('已修改 · 尚未保存'),refresh()))
 refresh()
