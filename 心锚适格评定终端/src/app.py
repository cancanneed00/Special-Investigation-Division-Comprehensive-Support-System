import sys,os,json,threading,queue,traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import tkinter as tk
from tkinter import ttk,filedialog,messagebox
from PIL import Image,ImageTk
from engine import Store,VERSION,recognize,evaluate

ROOT=Path(__file__).resolve().parent.parent
BG='#171725';PANEL='#222236';FG='#f0eef8';MUTED='#b0abc6';GOLD='#c8b5ff';BORDER='#38344f'

class App(tk.Tk):
    def __init__(self):
        super().__init__();self.title('心锚适格评定终端  '+VERSION+'  ·  识别与评分预览')
        self.geometry('1240x860');self.minsize(1080,760);self.configure(bg=BG)
        self.store=Store(ROOT);self.model=None;self.obs=None;self.result=None;self.busy=False;self.jobs=queue.Queue()
        self.protocol('WM_DELETE_WINDOW',self.close)
        st=ttk.Style(self);st.theme_use('clam')
        st.configure('.',background=BG,foreground=FG,font=('Microsoft YaHei UI',10))
        st.configure('TFrame',background=BG);st.configure('Card.TFrame',background=PANEL)
        st.configure('TLabel',background=BG,foreground=FG);st.configure('Muted.TLabel',foreground=MUTED)
        st.configure('Title.TLabel',font=('Microsoft YaHei UI',16,'bold'),foreground=GOLD)
        st.configure('Section.TLabel',font=('Microsoft YaHei UI',11,'bold'),foreground=GOLD)
        st.configure('TCheckbutton',background=BG,foreground=FG,indicatorbackground=PANEL)
        st.configure('TButton',background=BORDER,foreground=FG,padding=(12,7),borderwidth=0)
        st.map('TButton',background=[('active','#495366'),('disabled','#292e36')])
        st.configure('Accent.TButton',background='#655294',foreground='#ffffff')
        st.configure('TCombobox',fieldbackground=PANEL,background=BORDER,foreground=FG,arrowcolor=GOLD)
        st.map('TCombobox',fieldbackground=[('readonly',PANEL)],foreground=[('readonly',FG)])
        st.configure('TEntry',fieldbackground=PANEL,foreground=FG,insertcolor=FG)
        st.configure('TSpinbox',fieldbackground=PANEL,background=BORDER,foreground=FG,arrowcolor=GOLD,insertcolor=FG)
        st.configure('Treeview',background=PANEL,fieldbackground=PANEL,foreground=FG,rowheight=29,borderwidth=0)
        st.layout('Treeview',[('Treeview.treearea',{'sticky':'nswe'})])
        st.configure('Treeview.Heading',bordercolor=BORDER,lightcolor=BORDER,darkcolor=BORDER,relief='flat')
        st.configure('TNotebook',bordercolor=BG,lightcolor=BG,darkcolor=BG)
        st.configure('TNotebook.Tab',bordercolor=BG,lightcolor=BG,darkcolor=BG)
        st.configure('Vertical.TScrollbar',background=BORDER,troughcolor=PANEL,bordercolor=PANEL,lightcolor=BORDER,darkcolor=BORDER,arrowcolor=MUTED)
        st.configure('Treeview.Heading',background=BORDER,foreground=GOLD,font=('Microsoft YaHei UI',10,'bold'))
        st.map('Treeview',background=[('selected','#4b5260')])
        st.configure('TNotebook',background=BG,borderwidth=0);st.configure('TNotebook.Tab',background=PANEL,padding=(16,7))
        st.map('TNotebook.Tab',background=[('selected','#4b4335')],foreground=[('selected',GOLD)])
        top=ttk.Frame(self,padding=(16,8,16,5));top.pack(fill='x')
        ttk.Label(top,text='心锚适格评定终端',style='Title.TLabel').pack(side='left')
        self.summary=tk.StringVar(value='推荐图鉴与仓库评分')
        ttk.Label(top,textvariable=self.summary,foreground=MUTED).pack(side='left',padx=12)
        ttk.Label(top,text='识别预览版  ·  游戏操作未启用',foreground=GOLD).pack(side='right')
        bar=ttk.Frame(self,padding=(16,0,16,5));bar.pack(fill='x')
        ttk.Label(bar,text='数据表').pack(side='left',padx=(0,10))
        self.book=ttk.Combobox(bar,state='readonly',width=58);self.book.pack(side='left',fill='x',expand=True)
        self.loadbtn=ttk.Button(bar,text='读取 / 更新数据库',command=self.load);self.loadbtn.pack(side='left',padx=8)
        ttk.Button(bar,text='打开表格文件夹',command=lambda:os.startfile(self.store.folder)).pack(side='left')
        hint=ttk.Frame(self,padding=(16,0,16,4));hint.pack(fill='x')
        ttk.Label(hint,text='推荐配装表格（xlsx）由 B 站 UP 主「凤凰的使徒」维护，最新版请向其索取；放入「表格」文件夹后点击「读取 / 更新数据库」即可更新。',foreground=MUTED,style='Muted.TLabel',wraplength=1100).pack(side='left')
        self.tabs=ttk.Notebook(self);self.tabs.pack(fill='both',expand=True,padx=16,pady=(0,6))
        self.catalog=ttk.Frame(self.tabs,padding=14);self.scan=ttk.Frame(self.tabs,padding=14);self.info=ttk.Frame(self.tabs,padding=14)
        self.tabs.add(self.catalog,text='推荐图鉴');self.tabs.add(self.scan,text='截图识别与评分');self.tabs.add(self.info,text='规则与使用说明')
        self.build_catalog();self.build_scan();self.build_info()
        self.status=tk.StringVar(value='就绪');ttk.Label(self,textvariable=self.status,padding=(16,3,16,5),style='Muted.TLabel').pack(side='bottom',fill='x',before=self.tabs)
        self.after(100,self.poll);self.after(200,self.initial)

    def close(self):
        if self.busy:
            messagebox.showinfo('任务运行中','请等待本次导入或识别完成后关闭。OCR 最长等待 120 秒。');return
        self.destroy()
    def initial(self):
        files=self.store.files();self.book['values']=[p.name for p in files]
        if len(files)==1:self.book.current(0);self.load()
        elif files:
            try:saved=json.loads(self.store.config.read_text(encoding='utf-8')).get('workbook')
            except Exception:saved=None
            if saved in [p.name for p in files]:self.book.set(saved);self.load()
            else:self.summary.set('发现多个表格，请选择需要读取的版本。')
        else:
            self.summary.set('请将 xlsx 放入“表格”文件夹，再点击读取。')
            try:
                cache=self.store.cached()
                if cache:self.accept_model((cache,False));self.status.set('源表缺失：正在展示上次缓存。')
            except Exception as e:self.error(e)
    def run(self,label,fn,done):
        if self.busy:return
        self.busy=True;self.status.set(label);self.configure(cursor='watch')
        for b in [self.loadbtn,self.ocrbtn,self.sample1,self.sample2,self.scorebtn]:b.configure(state='disabled')
        def job():
            try:self.jobs.put((done,fn(),None))
            except Exception as e:self.jobs.put((None,None,(e,traceback.format_exc())))
        threading.Thread(target=job,daemon=True).start()
    def poll(self):
        try:
            done,value,error=self.jobs.get_nowait();self.busy=False;self.configure(cursor='')
            for b in [self.loadbtn,self.ocrbtn,self.sample1,self.sample2,self.scorebtn]:b.configure(state='normal')
            if error:self.error(error[0],error[1])
            else:
                try:done(value)
                except Exception as e:self.error(e,traceback.format_exc())
        except queue.Empty:pass
        self.after(100,self.poll)
    def error(self,e,trace=''):
        self.status.set('失败：'+str(e));(ROOT/'日志').mkdir(exist_ok=True)
        with (ROOT/'日志/errors.log').open('a',encoding='utf-8') as f:f.write(str(e)+'\n'+trace+'\n')
        messagebox.showerror('处理未完成',str(e))
    def load(self):
        files=self.store.files();names=[p.name for p in files];self.book['values']=names
        selected=self.book.get()
        if selected not in names:
            if len(names)==1:self.book.set(names[0]);selected=names[0]
            else:messagebox.showinfo('选择表格','请在表格文件夹放入 xlsx，并选择需要读取的文件。');return
        path=self.store.folder/selected
        self.run('正在校验表格与数据库…',lambda:self.store.load(path),self.accept_model)
    def accept_model(self,value):
        self.model,changed=value;m=self.model
        self.store.config.write_text(json.dumps({'workbook':m['filename']},ensure_ascii=False),encoding='utf-8')
        self.summary.set('%s  ·  %d 名探员  /  %d 种心锚  /  %d 行数值规则  ·  %s'%(m['filename'],len(m['characters']),len(m['anchors']),len(m['rules']),'数据库已更新' if changed else '数据库已加载'))
        self.agent['values']=['全部探员']+[c['name'] for c in m['characters']];self.agent.current(0)
        self.name['values']=list(m['anchors']);self.filter_chars();self.show_rules()
        self.status.set('数据就绪。可查看推荐，或导入截图进行识别。')
        if self.obs:self.calculate()
    def text_widget(self,parent):
        frame=ttk.Frame(parent);t=tk.Text(frame,bg=PANEL,fg=FG,insertbackground=FG,relief='flat',wrap='word',font=('Microsoft YaHei UI',10),padx=16,pady=14)
        scroll=ttk.Scrollbar(frame,command=t.yview);t.configure(yscrollcommand=scroll.set);scroll.pack(side='right',fill='y');t.pack(fill='both',expand=True)
        for tag,color,bold in [('heading',GOLD,True),('red','#ff9c98',True),('bold','#f1d195',True),('muted',MUTED,False)]:t.tag_configure(tag,foreground=color,font=('Microsoft YaHei UI',11 if tag=='heading' else 10,'bold' if bold else 'normal'))
        return frame,t
    def build_catalog(self):
        left=ttk.Frame(self.catalog);left.pack(side='left',fill='y',padx=(0,14))
        self.search=tk.StringVar();ttk.Entry(left,textvariable=self.search,width=20).pack(fill='x',pady=(0,10));self.search.trace_add('write',lambda *a:self.filter_chars())
        self.people=tk.Listbox(left,bg=PANEL,fg=FG,selectbackground='#554a37',selectforeground='#fff1d5',relief='flat',font=('Microsoft YaHei UI',11),width=20,activestyle='none',exportselection=False)
        self.people.pack(fill='both',expand=True);self.people.bind('<<ListboxSelect>>',lambda e:self.show_character())
        frame,self.rec_text=self.text_widget(self.catalog);frame.pack(side='left',fill='both',expand=True)
    def filter_chars(self):
        self.people.delete(0,'end')
        if not self.model:return
        for c in self.model['characters']:
            if self.search.get().lower() in (c['name']+c['job']).lower():self.people.insert('end',c['name'])
        if self.people.size():self.people.selection_set(0);self.show_character()
    def show_character(self):
        s=self.people.curselection()
        if not s:return
        ch=next(c for c in self.model['characters'] if c['name']==self.people.get(s[0]));t=self.rec_text;t.configure(state='normal');t.delete('1.0','end')
        t.insert('end',ch['name']+'   '+ch['job']+'   '+ch['signet']+'\n','heading')
        if ch['note']:t.insert('end',ch['note']+'\n','muted')
        for r in ch['recs']:
            t.insert('end','\n'+['偶像','图籍','钥匙'][r['slot']-1]+'  ·  推荐'+str(r['rank'])+'  '+(r['anchor'] or '无')+'\n','heading')
            for e in r['entries']:
                t.insert('end',('词条' if e['kind']=='entry' else '特性')+str(e['idx'])+'   ','muted')
                if e['all_equal']:t.insert('end','皆可')
                else:
                    for i,tok in enumerate(e['tokens']):
                        t.insert('end',tok['t']+('（低值偏好）' if tok['direction']=='min' else ''),'red' if tok['red'] else 'bold' if tok['bold'] else ())
                        if i<len(e['ops']):t.insert('end',' '+e['ops'][i]+' ')
                t.insert('end','\n')
        t.configure(state='disabled')
    def build_scan(self):
        bar=ttk.Frame(self.scan);bar.pack(fill='x',pady=(0,10))
        self.ocrbtn=ttk.Button(bar,text='导入截图并识别',style='Accent.TButton',command=self.choose_image);self.ocrbtn.pack(side='left')
        self.sample1=ttk.Button(bar,text='示例：苍炎狼徽',command=lambda:self.do_ocr(ROOT/'示例截图/image1.png'));self.sample1.pack(side='left',padx=6)
        self.sample2=ttk.Button(bar,text='示例：头狼金雕',command=lambda:self.do_ocr(ROOT/'示例截图/image10.png'));self.sample2.pack(side='left')
        self.agent=ttk.Combobox(bar,state='readonly',width=12,values=['全部探员']);self.agent.current(0);self.agent.pack(side='right')
        ttk.Label(bar,text='适配探员  ').pack(side='right')
        upper=ttk.Frame(self.scan);upper.pack(fill='x')
        self.picture=tk.Label(upper,bg='#111419',text='导入 16:9 游戏仓库详情截图\n或点击上方示例',fg=MUTED,width=43,height=15);self.picture.pack(side='left',padx=(0,14))
        editor=ttk.Frame(upper);editor.pack(side='left',fill='both',expand=True)
        line=ttk.Frame(editor);line.pack(fill='x',pady=(0,7))
        ttk.Label(line,text='名称 ').pack(side='left');self.name=ttk.Combobox(line,width=16);self.name.pack(side='left')
        ttk.Label(line,text='  等级 ').pack(side='left');self.level=tk.StringVar(value='1');ttk.Entry(line,textvariable=self.level,width=4).pack(side='left')
        ttk.Label(line,text='  阈值 ').pack(side='left');self.threshold=tk.StringVar(value='80');ttk.Entry(line,textvariable=self.threshold,width=4).pack(side='left')
        grid=ttk.Frame(editor);grid.pack(fill='x');self.fields=[]
        for col,label in enumerate(['位置','属性（可留空）','显示数值','单位','金星']):ttk.Label(grid,text=label,foreground=MUTED).grid(row=0,column=col,sticky='w',padx=3)
        for i in range(4):
            ttk.Label(grid,text=str(i+1)).grid(row=i+1,column=0,padx=3)
            stat=tk.StringVar();val=tk.StringVar();unit=tk.StringVar(value='%');star=tk.StringVar(value='未知')
            ttk.Entry(grid,textvariable=stat,width=15).grid(row=i+1,column=1,padx=3,pady=3,sticky='ew')
            ttk.Entry(grid,textvariable=val,width=8).grid(row=i+1,column=2,padx=3)
            ttk.Combobox(grid,textvariable=unit,values=['%','整数'],state='readonly',width=5).grid(row=i+1,column=3,padx=3)
            ttk.Combobox(grid,textvariable=star,values=['未知','有','无'],state='readonly',width=5).grid(row=i+1,column=4,padx=3)
            self.fields.append((stat,val,unit,star))
        row=ttk.Frame(editor);row.pack(fill='x',pady=6);self.traits=[]
        for i in range(2):
            ttk.Label(row,text='特性'+str(i+1)+' ').pack(side='left');v=tk.StringVar();self.traits.append(v);ttk.Entry(row,textvariable=v,width=14).pack(side='left',padx=(0,8))
        self.confirm=tk.BooleanVar(value=False);ttk.Checkbutton(editor,text='已核对并修正字段（包括空词条、单位与特性等级）',variable=self.confirm).pack(anchor='w')
        foot=ttk.Frame(editor);foot.pack(fill='x',pady=5)
        self.scorebtn=ttk.Button(foot,text='重新评分',command=self.calculate);self.scorebtn.pack(side='left')
        ttk.Button(foot,text='导出评分记录',command=self.export).pack(side='left',padx=6)
        self.decision=tk.StringVar(value='等待识别');ttk.Label(self.scan,textvariable=self.decision,foreground=GOLD,font=('Microsoft YaHei UI',13,'bold')).pack(anchor='w',pady=(10,7))
        self.results=ttk.Treeview(self.scan,columns=['char','rank','score','state','reason'],show='headings',height=5)
        for c,l,w in [('char','探员',100),('rank','推荐',65),('score','评分',65),('state','结果',85),('reason','原因',550)]:self.results.heading(c,text=l);self.results.column(c,width=w,stretch=c=='reason')
        self.results.pack(fill='x');self.results.bind('<<TreeviewSelect>>',lambda e:self.show_detail())
        f,self.detail=self.text_widget(self.scan);f.pack(fill='both',expand=True,pady=(8,0))
        self.agent.bind('<<ComboboxSelected>>',lambda e:self.calculate() if self.obs else None)
    def build_info(self):
        frame,self.rules_text=self.text_widget(self.info);frame.pack(fill='both',expand=True)
    def show_rules(self):
        t=self.rules_text;t.configure(state='normal');t.delete('1.0','end')
        t.insert('end','第一阶段：原生桌面 EXE，识别与评分\n','heading')
        t.insert('end','将表格放在 EXE 同目录的“表格”文件夹。启动时读取；替换后点击更新数据库。多个表格需要明确选择。\n推荐配装表格（xlsx）由 B 站 UP 主「凤凰的使徒」维护，最新版请向其索取；取得后放入“表格”文件夹，点击“读取 / 更新数据库”即可完成更新。\n\n')
        t.insert('end','当前可用\n','heading');t.insert('end','推荐图鉴、Excel 更新、数据库缓存、本地截图 OCR、字段修正、逐探员评分、JSON 记录导出。无需浏览器、网络或额外安装 Python。\n\n')
        t.insert('end','识别范围\n','heading');t.insert('end','首版支持接近 16:9 的完整游戏心锚详情截图，按文档布局定位。请裁掉黑边、窗口边框。尚未接入实时截图、仓库遍历或鼠标操作。金星当前需人工核对，未知不会当作无星。两张示例可直接试用。\n\n')
        t.insert('end','评分规则（试用参数）\n','heading');t.insert('end','红字为不可替代；加粗组按重要推荐处理。重要词条要求前两档；普通词条低档不扣数值分。优先级 > 每级降0.2，≥ 降0.1，= 不变；重要权重3、普通1、特性乘0.5；重要一档系数1、二档0.95。总分0—100，默认阈值80。硬条件未满足时，高分也不达标。\n\nmin! 低值偏好、数值跨版本歧义、未知心锚或异常识别进入待复核。无推荐不等于应该放弃。建议锁定/放弃仅显示，不执行游戏操作。\n\n')
        t.insert('end','表格原始数值说明\n','heading');t.insert('end',self.model['notes']+'\n\n')
        t.insert('end','本次导入提示\n','heading');t.insert('end','\n'.join(self.model['warnings']) or '无')
        t.configure(state='disabled')
    def choose_image(self):
        p=filedialog.askopenfilename(title='选择完整的游戏仓库详情截图',filetypes=[('图片','*.png *.jpg *.jpeg *.bmp'),('所有文件','*.*')])
        if p:self.do_ocr(Path(p))
    def do_ocr(self,path):
        if not self.model:messagebox.showinfo('需要数据','请先读取表格。');return
        self.tabs.select(self.scan)
        self.run('本地 OCR 识别中，请稍候…',lambda:recognize(ROOT,path,self.model),self.accept_obs)
    def accept_obs(self,obs):
        self.obs=obs;self.confirm.set(False);self.name.set(obs['anchor']);self.level.set(str(obs['level'] or ''))
        for i,fields in enumerate(self.fields,1):
            v=obs['entries'].get(str(i)) or {};fields[0].set(v.get('stat',''));fields[1].set(v.get('value',''));fields[2].set('%' if v.get('unit')=='percent' else '整数');fields[3].set('未知')
        for i,v in enumerate(self.traits,1):v.set(obs['traits'].get(str(i)) or '')
        with Image.open(obs['image']) as im:im=im.copy();im.thumbnail((430,245));self.preview=ImageTk.PhotoImage(im)
        self.picture.configure(image=self.preview,text='',width=430,height=245)
        self.calculate();self.status.set('识别完成。星标未自动识别，可核对字段后重新评分。')
    def observation_from_form(self):
        if not self.obs:raise ValueError('请先导入截图或运行示例')
        rows={}
        for i,(s,v,u,g) in enumerate(self.fields,1):
            stat=s.get().strip();val=v.get().strip().rstrip('%％');unit='percent' if u.get()=='%' else 'flat'
            if not stat and not val:rows[str(i)]=None
            else:rows[str(i)]={'stat':stat,'value':val,'unit':unit,'star':{'有':True,'无':False,'未知':None}[g.get()]}
        try:level=int(self.level.get())
        except ValueError:level=None
        obs=dict(self.obs,anchor=self.name.get().strip(),level=level,entries=rows,traits={str(i):v.get().strip() or None for i,v in enumerate(self.traits,1)})
        changed=any(obs[k]!=self.obs[k] for k in ['anchor','level','entries','traits'])
        obs['issues']=[] if self.confirm.get() else list(self.obs.get('issues',[]))
        if changed and not self.confirm.get():obs['issues'].append('字段已修改，请勾选已核对后重新评分')
        obs['manually_confirmed']=self.confirm.get()
        return obs
    def calculate(self):
        if not self.obs or not self.model:return
        try:
            obs=self.observation_from_form();threshold=float(self.threshold.get())
            result=evaluate(self.model,obs,None if self.agent.get()=='全部探员' else [self.agent.get()],threshold)
        except Exception as e:messagebox.showerror('无法评分',str(e));return
        self.current_obs=obs;self.result=result;self.results.delete(*self.results.get_children())
        for i,m in enumerate(result['matches']):self.results.insert('','end',iid=str(i),values=(m['character'],m['rank'],m['score'],m['state'],'；'.join(m['reasons']) or '按当前阈值比较'))
        self.decision.set(result['decision']+'  ·  仅预览，不操作游戏'+('  /  '+'；'.join(result['reasons']) if result['reasons'] else ''))
        if result['matches']:self.results.selection_set('0');self.show_detail()
        else:
            self.detail.configure(state='normal');self.detail.delete('1.0','end');self.detail.insert('end','；'.join(result['reasons']));self.detail.configure(state='disabled')
    def show_detail(self):
        sel=self.results.selection()
        if not sel or not self.result:return
        m=self.result['matches'][int(sel[0])];t=self.detail;t.configure(state='normal');t.delete('1.0','end')
        t.insert('end',m['character']+'  ·  '+m['state']+'  '+str(m['score'])+'分\n','heading')
        for d in m['details']:t.insert('end',d['label']+'  '+d['actual']+'  '+d['tier']+'  → 推荐 '+d['recommend']+('  [重要]' if d['important'] else '')+'\n','bold' if d['important'] else ())
        if m['note']:t.insert('end','探员备注：'+m['note']+'\n','muted')
        t.configure(state='disabled')
    def export(self):
        if not self.result:messagebox.showinfo('没有记录','请先识别并评分。');return
        p=filedialog.asksaveasfilename(title='导出评分记录',defaultextension='.json',initialfile='心锚评分记录.json',filetypes=[('JSON','*.json')])
        if p:
            try:Path(p).write_text(json.dumps({'version':VERSION,'observation':self.current_obs,'evaluation':self.result},ensure_ascii=False,indent=2),encoding='utf-8');self.status.set('已导出：'+p)
            except Exception as e:self.error(e)

if __name__=='__main__':
    try:App().mainloop()
    except Exception:
        (ROOT/'日志').mkdir(exist_ok=True);(ROOT/'日志/startup-error.log').write_text(traceback.format_exc(),encoding='utf-8')
        try:messagebox.showerror('心锚适格评定终端启动失败',traceback.format_exc())
        except Exception:pass
