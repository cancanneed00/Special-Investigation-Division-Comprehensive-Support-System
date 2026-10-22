"""Headless smoke test of the 0.6.6 UI paths: event-anchor display,
five-star tab in the details dialog, unscored rows. Window stays withdrawn."""
import sys,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from engine import Store,import_workbook,evaluate
import desktop,ui_v4

ROOT=HERE.parent
book=next((ROOT/'表格').glob('*.xlsx'))
model=import_workbook(book)
app=desktop.App();app.withdraw()
try:
    app.maintenance_started=True
    app.accept_model((model,False))
    assert app.people.size()==40

    # 1) five-star recommended anchor: results table + details dialog with the new tab
    a=model['anchors']['一万个问题']
    obs={'anchor':'一万个问题','level':1,'rarity':3,'entries':{},'traits':{},'issues':[],'image':str(book)}
    for i in range(1,5):
        pool=a['pools'].get(str(i)) or []
        if pool:obs['entries'][str(i)]={'stat':pool[0],'value':'5','unit':'percent' if pool[0].endswith('%') else 'flat','star':True}
    ev=evaluate(model,obs)
    app.display(obs,ev)
    assert app.result['matches5'],'five-star matches expected'
    kids=app.results.get_children()
    assert kids
    app.show_detail()
    ui_v4.open_details(app);app.update_idletasks()
    detail=[t for t in app.winfo_children()]
    app.update()
    print('OK five-star anchor: scan page rendered, details dialog opened')

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
finally:
    app.destroy()
print('UI SMOKE PASSED')
