"""Headless smoke test of the 0.6.6 UI paths: event-anchor display,
five-star tab in the details dialog, unscored rows. Window stays withdrawn."""
import sys,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from engine import Store,import_workbook,evaluate,anchor_recommendations
import desktop,ui_v4

ROOT=HERE.parent
def find_book():
    for cand in [ROOT/'表格',
                 Path(r'C:\Users\30860\Documents\New project\publish-anchor-065\test-068\心锚适格评定终端-0.6.8\表格'),
                 Path(r'C:\Users\30860\Documents\New project\publish-anchor-065\anchor-fitness-assessment-terminal-0.6.5\心锚适格评定终端-0.6.5\表格')]:
        hits=sorted(cand.glob('*.xlsx'))
        if hits:return hits[0]
    raise SystemExit('workbook not found')
book=find_book()
model=import_workbook(book)
app=desktop.App();app.withdraw()
try:
    app.maintenance_started=True
    app.accept_model((model,False))
    assert app.people.size()==len(model['characters'])+len(model['characters5'])

    # 1) five-star recommended anchor: results table + details dialog with the new tab
    a=model['anchors']['一万个问题']
    obs={'anchor':'一万个问题','level':1,'rarity':3,'entries':{},'traits':{},'issues':[],'image':str(book)}
    for i in range(1,5):
        pool=a['pools'].get(str(i)) or []
        if pool:obs['entries'][str(i)]={'stat':pool[0],'value':'5','unit':'percent' if pool[0].endswith('%') else 'flat','star':True}
    ev=evaluate(model,obs)
    app.display(obs,ev)
    assert app.result['matches5'],'five-star matches expected'
    # the results table lists six-star matches only. 一万个问题 is five-star only
    # in the current workbook, so require the row count to track the matches
    # instead of demanding rows -- rendering is covered just below with an
    # anchor that does carry six-star recommendations.
    kids=app.results.get_children()
    assert len(kids)==len(ev['matches']),(len(kids),len(ev['matches']))
    app.show_detail()
    ui_v4.open_details(app);app.update_idletasks()
    detail=[t for t in app.winfo_children()]
    app.update()
    print('OK five-star anchor: scan page rendered, details dialog opened')

    # the scan table really renders rows: pick an anchor that carries six-star
    # recommendations (the workbook is maintained externally, so never hard-code one)
    six_name=next(n for n in model['anchors'] if anchor_recommendations(model,n)[0])
    obs6={'anchor':six_name,'level':1,'rarity':3,'entries':{},'traits':{},'issues':[],'image':str(book)}
    ev6=evaluate(model,obs6)
    app.display(obs6,ev6)
    assert app.results.get_children(),'results table renders six-star rows (%s)'%six_name
    print('OK results table renders six-star rows for',six_name)

    # 2) event anchor: unscored rows, fixed entries, no crash on selection
    obs2={'anchor':'雀姬奇物','level':1,'rarity':2,'entries':{},'traits':{},'issues':[],'image':str(book)}
    ev2=evaluate(model,obs2)
    assert ev2['decision']=='活动心锚'
    app.display(obs2,ev2)
    assert app.results.get_children()
    app.results.selection_set('0');app.show_detail();app.update_idletasks()
    assert '固定词条' in app.titlevar.get(),app.titlevar.get()
    assert '不评分' in app.scoresvar.get(),app.scoresvar.get()
    ui_v4.open_details(app);app.update()
    print('OK event anchor: scan page + details dialog rendered')

    # 3) all_match_details and brief tolerate unscored rows
    text=ui_v4.all_match_details(ev2)
    assert '活动心锚不评分' in text,text
    assert '活动心锚' in ui_v4.brief(ev2)
    print('OK text helpers handle unscored rows')

    # 4) history-style rendering with an event row
    app.batch_records=[{'observation':obs2,'evaluation':ev2,'action':'活动心锚 · 可保留使用'}]
    app.restore_scan_results(app.batch_records);app.update_idletasks()
    app.history.selection_set('0');app.select_history();app.update_idletasks()
    assert '推荐使用' in app.historycaption.get(),app.historycaption.get()
    print('OK history table and caption render the event row')
    # 5) details dialog exposes the encyclopedia jump; catalog anchor mode renders
    ui_v4.open_details(app);app.update()
    def buttons(w,out):
        for c in w.winfo_children():
            try:
                if c.cget('text')=='在图鉴中查看 ↗':out.append(c)
            except Exception:pass
            buttons(c,out)
        return out
    found=[]
    import tkinter as tk
    for w in app.winfo_children():
        if isinstance(w,tk.Toplevel):found+=buttons(w,[])
    assert found,'details dialog should offer the encyclopedia jump'
    app.catalog_mode.set('心锚');app.switch_catalog_mode()
    app.jump_to_catalog(obs2['anchor']);app.update_idletasks()
    texts=[]
    def collect(w):
        for c in w.winfo_children():
            try:
                if c.cget('text'):texts.append(c.cget('text'))
            except Exception:pass
            collect(c)
    collect(app.catalog_body)
    assert any(t.startswith('六星探员推荐') for t in texts),texts[:5]
    print('OK encyclopedia jump button + catalog anchor mode for',obs2['anchor'])

    # 6) character view gains the source filter; a five-star character opens her anchors
    app.catalog_mode.set('探员');app.switch_catalog_mode()
    assert app.people.size()==len(model['characters'])+len(model['characters5'])
    app.catalog_source.set('仅五星');app.catalog_source_changed();app.update_idletasks()
    assert app.people.size()==len(model['characters5'])
    name5=app.people.get(0)
    app.people.selection_set(0);app.catalog_select();app.update_idletasks()
    texts=[]
    collect(app.catalog_body)
    assert any(name5 in t for t in texts),texts[:5]
    assert any('五星探员 · 优先级低于六星' in t for t in texts),texts[:5]
    assert any('推荐' in t and ('偶像' in t or '图籍' in t or '钥匙' in t) for t in texts),texts[:5]
    print('OK character source filter + five-star character view for',name5)
finally:
    app.destroy()
print('UI SMOKE PASSED')
