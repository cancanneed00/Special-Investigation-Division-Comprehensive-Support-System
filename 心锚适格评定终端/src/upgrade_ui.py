from pathlib import Path
p=Path(__file__).parent/'desktop.py';s=p.read_text(encoding='utf-8')
for name in ['build_scan','build_policy','show_rules','show_detail']:
 start=s.index(' def '+name+'(');end=s.find('\n def ',start+2)
 if end<0:raise RuntimeError(name)
 s=s[:start]+' def '+name+'(self):\n  return ui.'+name+'(self)\n'+s[end:]
s=s.replace('import app as base','import app as base\nimport ui_v4 as ui\nimport history as archive_store')
s=s.replace("self.sample1,self.sample2,",'')
s=s.replace('0x77','0x0D').replace('F8','回车')
s=s.replace("self.bind('<Escape>',lambda e:self.stop());", "self.bind('<Return>',lambda e:self.stop());self.bind('<KP_Enter>',lambda e:self.stop());")
s=s.replace("text='本轮全部结果'","text='历史与本轮结果'")
s=s.replace("self.minsize(1180,790)","self.minsize(960,680)")
s=s.replace("self.picture.configure(image=self.preview,text='',width=420,height=236)","self.picture.configure(image=self.preview,text='',width=260,height=190)")
s=s.replace("with Image.open(obs['image']) as im:im=im.copy();im.thumbnail((420,236));self.preview=ImageTk.PhotoImage(im)","try:\n   with Image.open(obs['image']) as im:im=im.copy().crop((0,0,550,720));im.thumbnail((260,190));self.preview=ImageTk.PhotoImage(im)\n  except (FileNotFoundError,OSError):self.preview=None")
s=s.replace("'特性：'", "'特性（仅供参考，不计分）：'")
s=s.replace("paths=list((ROOT/'数据/整理记录').glob('*/results.json'))", "paths=list((ROOT/'数据/历史记录').glob('*/results.json')) or list((ROOT/'数据/整理记录').glob('*/results.json'))")
s=s.replace("obs=reparse_saved(row['observation'],self.model);ev=evaluate(self.model,obs,selected,policy)","old=row['observation'];obs=reparse_saved(old,self.model) if Path(old['image']).is_file() else old;ev=evaluate(self.model,obs,selected,policy)")
s=s.replace("  if ev['matches']:self.results.selection_set('0');self.show_detail()", "  if ev['matches']:self.results.selection_set('0');self.show_detail()\n  else:\n   self.detail.configure(state='normal');self.detail.delete('1.0','end');self.detail.insert('end','当前没有探员推荐此心锚。数值质量与直接保留独立判断。');self.detail.configure(state='disabled')")
p.write_text(s,encoding='utf-8')
