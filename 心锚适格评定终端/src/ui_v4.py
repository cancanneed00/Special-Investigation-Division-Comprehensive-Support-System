"""Native, scrollable Tk views. No browser or web server."""
import tkinter as tk
from tkinter import ttk
import json
from pathlib import Path
from PIL import Image,ImageTk
import app as base
from scoring import DEFAULT_POLICY,validate_policy

def scroll_page(parent):
 shell=ttk.Frame(parent);shell.pack(fill='both',expand=True)
 canvas=tk.Canvas(shell,bg=base.BG,highlightthickness=0);bar=ttk.Scrollbar(shell,command=canvas.yview)
 bar.pack(side='right',fill='y');canvas.pack(side='left',fill='both',expand=True);canvas.configure(yscrollcommand=bar.set)
 body=ttk.Frame(canvas,padding=8);item=canvas.create_window(0,0,window=body,anchor='nw')
 body.bind('<Configure>',lambda e:canvas.configure(scrollregion=canvas.bbox('all')))
 canvas.bind('<Configure>',lambda e:canvas.itemconfigure(item,width=e.width))
 def wheel(e):
  if isinstance(e.widget,(tk.Text,ttk.Treeview,tk.Listbox)):return
  w=e.widget
  while w is not None:
   if w is body or w is canvas:canvas.yview_scroll(-int(e.delta/120),'units');break
   w=getattr(w,'master',None)
 parent.winfo_toplevel().bind('<MouseWheel>',wheel,add='+')
 return body

def label(parent,text='',variable=None,style=None,color=None):
 opts={'textvariable':variable} if variable is not None else {'text':text}
 if style:opts['style']=style
 if color:opts['foreground']=color
 w=ttk.Label(parent,**opts,justify='left',wraplength=600);w.pack(fill='x',pady=4)
 parent.bind('<Configure>',lambda e:w.configure(wraplength=max(120,e.width-35)) if w.winfo_exists() else None,add='+');return w

def card(parent,title):
 f=ttk.LabelFrame(parent,text=title,padding=14);f.pack(fill='x',pady=8);return f

def toggle(parent,text,var):
 def update(*a):b.configure(text=('已启用  ·  ' if var.get() else '已关闭  ·  ')+text,style='Accent.TButton' if var.get() else 'TButton')
 b=ttk.Button(parent,command=lambda:var.set(not var.get()));b.pack(anchor='w',pady=5);var.trace_add('write',update);update();return b

def table(parent,columns,height=5):
 f=ttk.Frame(parent);f.pack(fill='both',expand=True)
 t=ttk.Treeview(f,columns=[c[0] for c in columns],show='headings',height=height)
 for key,title,width in columns:t.heading(key,text=title);t.column(key,width=width,minwidth=40,stretch=key in ('reason','char'))
 y=ttk.Scrollbar(f,command=t.yview);y.pack(side='right',fill='y')
 t.configure(yscrollcommand=y.set);t.pack(fill='both',expand=True);return t

def build_scan(a):
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
 a.titlevar=tk.StringVar(value='选择游戏中的心锚，再点击识别');label(fields,variable=a.titlevar,style='Section.TLabel')
 a.scoresvar=tk.StringVar(value='数值分 —    匹配分 —');label(fields,variable=a.scoresvar,color=base.GOLD)
 a.fields=ttk.Treeview(fields,columns=['p','s','v','t'],show='headings',height=4)
 for key,title,width in [('p','词条',45),('s','属性',140),('v','数值',85),('t','档位',150)]:
  a.fields.heading(key,text=title);a.fields.column(key,width=width,minwidth=40,stretch=key in ('s','t'))
 a.fields.pack(fill='x')
 a.traitvar=tk.StringVar() # Traits are available in the details dialog, not a scoring input.
 a.decision=tk.StringVar(value='识别后显示结论；双击推荐或点“详细依据”查看完整解释。');label(body,variable=a.decision,color=base.GOLD)
 bar=ttk.Frame(body);bar.pack(fill='x',pady=4)
 ttk.Label(bar,text='推荐探员',style='Section.TLabel').pack(side='left')
 ttk.Button(bar,text='详细依据 ↗',command=lambda:open_details(a)).pack(side='right')
 ttk.Button(bar,text='导出记录',command=a.export).pack(side='right',padx=4)
 a.results=table(body,[('char','探员',110),('rank','方案',60),('score','匹配分',75),('reason','关键条件',350)],3)
 a.results.bind('<<TreeviewSelect>>',lambda e:a.show_detail());a.results.bind('<Double-1>',lambda e:open_details(a))
 a.detail=tk.Text(body) # Full explanation is available on demand, never nested in the page.
 bar=ttk.Frame(body);bar.pack(side='bottom',fill='x',pady=(8,0),before=a.results.master)
 a.batchbtn=ttk.Button(bar,text='仓库 · 只评分',command=lambda:a.start(False));a.batchbtn.pack(side='left')
 a.startbtn=ttk.Button(bar,text='仓库 · 按规则标记',style='Accent.TButton',command=lambda:a.start(True));a.startbtn.pack(side='left',padx=6)
 ttk.Button(bar,text='停止 · 回车',command=a.stop).pack(side='left')
 a.resumebtn=ttk.Button(bar,text='断点 / 手动续扫',command=a.resume_scan);a.resumebtn.pack(side='left',padx=6)
 ttk.Label(bar,text='批量仅1级 · 不解离',foreground=base.MUTED).pack(side='right')

def brief(ev):
 reasons=ev.get('reasons',[])
 if ev.get('decision')=='活动心锚':
  names=list(dict.fromkeys(m['character'] for m in ev.get('matches',[])))
  return '活动心锚 · 可保留使用'+(('（'+names[0]+(' 等'+str(len(names))+'人' if len(names)>1 else '')+'推荐）') if names else '（暂无探员推荐）')
 if '二星心锚直接跳过' in reasons:return '二星跳过 · 不在百科'
 if '一星心锚直接跳过' in reasons:return '一星跳过 · 不在百科'
 if ev.get('decision')=='锁定':
  eligible=ev.get('eligible_matches',[])
  if any('直接保留' in r for r in reasons):return '高数值直接保留'
  names=list(dict.fromkeys(m['character'] for m in eligible))
  return ('适合 '+names[0]+(' 等'+str(len(names))+'人' if len(names)>1 else '')+' · 达标') if names else '达到保留条件'
 if ev.get('decision')=='标记放弃':return (reasons[-1] if reasons else '低质量筛选').split('（')[0]
 if ev.get('decision')=='跳过复核':return '待复核：'+(reasons[0] if reasons else '识别不确定')[:22]
 if any('仅处理1级' in r or '仅支持1级' in r for r in reasons):return '该等级不参与仓库整理'
 return '匹配达标但档位不足' if any('匹配分达标' in r for r in reasons) else '未达保留，也未达放弃'

def gate_brief(m):
 if m.get('no_score'):return '推荐使用 · 不评分'
 if m.get('gate_pass') is True:return '档位通过'
 failed=[c['label']+('待复核' if c['pass'] is None else '未达标') for c in m.get('gate_checks',[]) if c['pass'] is not True]
 return ' / '.join(failed) or '待复核'

def all_match_details(e):
 names=list(dict.fromkeys(m['character'] for m in e.get('eligible_matches',[])))
 lines=['满足推荐保留：'+('、'.join(names) if names else '无')]
 eligible={(m['character'],m['rank']) for m in e.get('eligible_matches',[])}
 for m in e.get('matches',[]):
  lines.append('\n【'+m['character']+'】')
  for c in m.get('alternatives') or [m]:
   label='满足推荐保留' if (m['character'],c['rank']) in eligible else '未满足推荐保留'
   if c.get('score') is None:lines.append(f"推荐 {c['rank']} · 活动心锚不评分 · {label}")
   else:lines.append(f"推荐 {c['rank']} · 匹配 {c['score']:g} 分 · {label}")
   for d in c.get('details',[]):
    lines.append(d['label']+'：'+d['actual']+'；推荐 '+d['recommend']+('（特性仅供参考）' if d['label'].startswith('特性') else ''))
   for check in c.get('gate_checks',[]):
    lines.append(('通过' if check['pass'] is True else '未通过' if check['pass'] is False else '待复核')+' · '+check['label']+' '+check['reason'])
  if m.get('note'):lines.append('配装备注：'+m['note'])
 return '\n'.join(lines)

def open_details(a):
 from detail_view import open_details as show
 return show(a)


def build_catalog(a):
 left=ttk.Frame(a.catalog,padding=(0,0,14,0));left.pack(side='left',fill='y')
 label(left,'探员图鉴',style='Title.TLabel');label(left,'搜索姓名或职业',color=base.MUTED)
 a.search=tk.StringVar();ttk.Entry(left,textvariable=a.search,width=18).pack(fill='x',pady=8);a.search.trace_add('write',lambda *x:a.filter_chars())
 a.people=tk.Listbox(left,bg=base.PANEL,fg=base.FG,selectbackground='#315479',selectforeground='white',relief='flat',font=('Microsoft YaHei UI',11),width=18,activestyle='none',exportselection=False)
 a.people.pack(fill='both',expand=True);a.people.bind('<<ListboxSelect>>',lambda e:a.show_character())
 a.catalog_body=scroll_page(a.catalog)

def show_character(a):
 s=a.people.curselection()
 if not s or not a.model:return
 ch=next(c for c in a.model['characters'] if c['name']==a.people.get(s[0]))
 for w in a.catalog_body.winfo_children():w.destroy()
 label(a.catalog_body,ch['name'],style='Title.TLabel');label(a.catalog_body,' / '.join(x for x in [ch['job'],ch['signet'],ch['damage']] if x),color=base.MUTED)
 if ch['note']:label(card(a.catalog_body,'配装说明'),ch['note'])
 for rec in ch['recs']:
  if not rec['active']:continue
  box=card(a.catalog_body,['偶像','图籍','钥匙'][rec['slot']-1]+'  ·  推荐 '+str(rec['rank'])+'  ·  '+rec['anchor'])
  for e in rec['entries']:
   important=any(t['bold'] for t in e['tokens']);red=any(t['red'] for t in e['tokens']);minimum=any(t['direction']=='min' for t in e['tokens'])
   suffix='仅供参考，不计分' if e['kind']=='trait' else '最低两档' if minimum else '不可替代 · 前两档' if red else '重要 · 前两档' if important else '允许前三档'
   label(box,('特性 ' if e['kind']=='trait' else '词条 ')+str(e['idx'])+'   '+e['raw']+'    ['+suffix+']',color='#ffaaa0' if red else base.GOLD if important or minimum else base.FG)

def build_policy(a):
 from policy_view import build_policy as build
 return build(a)

def reset_policy(a):
 for kind,fields in a.policyvars.items():
  for key,v in fields.items():v.set(DEFAULT_POLICY[kind][key])
 a.status.set('已恢复参考值；点击保存规则可持久保存。')


HELP=[('评分公式与参考阈值','数值 Q = 100 × Σ(wᵢ × 当前值ᵢ/对应等级满值ᵢ) / Σwᵢ × min(1,词条数/3)。w = 0.4、0.3、0.2、0.1，仅对存在的词条求和；第四词条存在即满档。\n匹配 M = 100 × Σ(词条权重 × 偏好符合度) / Σ词条权重，与实际数值独立；每个推荐方案分别计算。\n先处理缺条和不确定项，再保留高数值或推荐达标心锚。其余：Q<95 且 M<70，或 Q<85，建议放弃；全低档规则仍独立生效。等于阈值不触发“低于”。无推荐时联合筛选按M=0。\n参考值是基于历史记录对比的规则建议，并非经人工标注训练的模型；可在规则页修改。单条普通词条低档本身不是放弃依据。'),('快速开始','1  把xlsx放入“表格”文件夹，点击读取 / 更新数据库。\n2  在游戏中打开心锚仓库，保持16:9窗口可见。\n3  先使用“扫描仓库 · 只评分”，检查历史结果。\n4  确认规则后使用“按规则标记”。多个表格需要明确选择。\n推荐配装表格（xlsx）由 B 站 UP 主「凤凰的使徒」维护，最新版请向其索取；取得后放入“表格”文件夹，点击“读取 / 更新数据库”即可完成更新。'),
 ('按钮与快捷键','回车：停止当前任务（游戏在前台也生效）。\n识别当前选中：只读取一件。导入截图：读取本地图片。\n重新评分：按当前规则重算。历史结果：浏览各轮截图、处理结论和推荐探员。\n所有长页面可以滚轮滚动；表格可以拖动滚动条，点击行查看完整详情。'),
 ('数值分与直接保留','第1—4词条权重为40%、30%、20%、10%，逐条按当前值/该版本满值计算。缺失词条不占权重；仅2条及以下再乘词条数量/3，避免两条满值冒充完整高质量。\n数值分严格超过95直接保留，不依赖匹配分。恰好95不触发直接保留。未知值或分数区间跨界时待复核。'),
 ('推荐匹配与档位门槛','只比较数值词条；特性不计分、不阻止保留，单独展示实际与推荐。未推荐此心锚的探员不显示。\n红字词条权重5、加粗3、普通1；固定词条乘0.25，以提高随机词条的区分度。皆可整格不进入匹配分分母。>递减0.2，≥递减0.1。权重属于程序规则，非原表官方分数。\n推荐保留默认匹配至少80分，重要词条前两档，不重要/皆可前三档，min最低两档。红字词条必须匹配。单条4—6档不直接判放弃。'),
 ('同名词条数值膨胀如何处理','按心锚位置、词条位置、属性和单位分别匹配原表各数值版本，不把同名词条合并为一个满值。金星和数值共同排除不可能版本。\n多个版本仍可解释该数值时显示评分/档位区间；跨越保留或放弃边界时待复核。表内两档之间的值保留相邻档位范围。超过所有版本范围时提示更新表格，不外推为满分。\n单件支持1级、30级，分别读取原表对应等级列；批量仅处理1级。其他等级不插值。第四词条存在即第一档。'),
 ('历史、截图和空间占用','扫描结束或停止后自动归档；结果包含截图、数值分、匹配分、推荐探员及每条处理原因。\n截图默认7天、最多300MB，超期显示“截图已清理”；轻量结果摘要保留。翻页稳定检测的中间截图不长期保留。界面只加载当前截图，不把所有图片载入内存。\n配队、拓变和环境备注显示原文，不假定用户满足条件。')]

HELP.insert(2,('扫描速度与二星跳过','仓库扫描先用连续两帧确认星级；二星直接跳过词条OCR、评分和标记，结果中显示“二星跳过”。星级不明确时继续正常识别。\nOCR模型在本次程序运行中复用，识别任务串行处理，避免多进程争抢普通电脑的CPU与内存。稳定性截图不重复进行文字OCR；每次游戏输入仍验证仓库界面和画面变化。\n回车可停止识别，异常时终止OCR进程，下次识别自动重建。整理记录的summary.json记录总耗时、OCR耗时、跳过二星数量及各类操作耗时，便于定位不同电脑的瓶颈。'))

HELP[2]=('低星活动心锚与扫描速度','一星、二星先做仅名称的轻量识别：名字落在心锚百科中的活动心锚（如雀姬奇物）会显示原表固定词条和推荐它的探员，不评数值分与匹配度，也不会被自动锁定或放弃；不在百科的低星心锚直接跳过，不识别词条。星级不明确时继续正常识别。\n网格支持三星蓝边、二星绿边、一星灰边；不会仅因进入低星区域而判定列表不稳定。详细依据列出全部推荐探员及每个方案的匹配和保留条件。\nOCR模型在本次运行中复用，识别任务串行处理。稳定性截图不重复做文字OCR，每次游戏输入仍校验画面。回车可停止，异常后下次识别自动重建进程。\nsummary.json记录总耗时、OCR耗时、一星和二星跳过数量、活动心锚数量及操作耗时。')

HELP.insert(3,('翻页定位与断点续扫','翻页定位失败或停止后，点击“断点 / 手动续扫”。程序会显示最后完成项和继续模式。\n自动续扫要求最后完成项仍被选中，校验通过后从下一件开始；手动续扫要求你选中第一件未处理心锚，并使它完整可见，从该件开始。\n续扫不返回顶部，结果另存并关联前一轮。保持低等级优先排序；无法确认起点时取消，不按心锚名称猜位置。'))

HELP.insert(4,('五星角色心锚推荐','五星角色心锚推荐表与六星同格式解析，使用相同的匹配与档位规则。结果只在“详细依据”的“五星探员推荐”页显示，优先级低于六星，仅供参考：不参与锁定、标记放弃的判断，也不计入最高匹配分。该页仅在当前心锚存在五星推荐时出现。'))

def show_rules(a):
 t=a.rules_text;t.configure(state='normal');t.delete('1.0','end')
 for title,body in HELP:t.insert('end',title+'\n','heading');t.insert('end',body+'\n\n')
 if a.model:t.insert('end','原表数值说明\n','heading');t.insert('end',a.model['notes'])
 t.configure(state='disabled')

def show_detail(a):
 sel=a.results.selection()
 if not sel or not a.result:return
 m=a.result['matches'][int(sel[0])];t=a.detail;t.configure(state='normal');t.delete('1.0','end')
 if m.get('no_score'):
  t.insert('end',m['character']+'  ·  推荐'+str(m['rank'])+'  ·  活动心锚不评分\n','heading')
  t.insert('end',m['reason']+'\n')
  if m['note']:t.insert('end','配装备注：'+m['note']+'\n','muted')
  t.configure(state='disabled');return
 t.insert('end',m['character']+'  ·  词条匹配 '+str(m['score'])+' 分\n','heading')
 for d in m['details']:
  trait=d['label'].startswith('特性');t.insert('end',d['label']+'  '+d['actual']+'\n','bold');t.insert('end','推荐：'+d['recommend']+('  [仅供参考，不计分]' if trait else '  ·  符合度 '+str(d['match'])+'%')+'\n')
 for choice in m.get('alternatives',[m]):
  t.insert('end','\n推荐 '+str(choice['rank'])+' 的保留条件\n','heading')
  for c in choice.get('gate_checks',[]):t.insert('end',('通过' if c['pass'] is True else '未通过' if c['pass'] is False else '待复核')+' · '+c['label']+' '+c['reason']+'\n')
 if m['note']:t.insert('end','\n配装备注\n','heading');t.insert('end',m['note'])
 t.configure(state='disabled')
