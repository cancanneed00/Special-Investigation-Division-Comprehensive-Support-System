"""0.6.8 verification: the character view also gains a six/five-star source
filter, and a five-star character opens her recommended anchors. Covers the
pure helper plus headless Tk round-trips. No game or screenshots needed."""
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from engine import import_workbook,catalog_people,anchor_recommendations

def find_book():
    for cand in [HERE.parent/'表格',
                 Path(r'C:\Users\30860\Documents\New project\publish-anchor-065\test-068\心锚适格评定终端-0.6.8\表格'),
                 Path(r'C:\Users\30860\Documents\New project\publish-anchor-065\anchor-fitness-assessment-terminal-0.6.5\心锚适格评定终端-0.6.5\表格')]:
        if cand.exists():
            hits=sorted(cand.glob('*.xlsx'))
            if hits:return hits[0]
    raise SystemExit('workbook not found')

book=find_book();model=import_workbook(book)
print('workbook:',book.name)
print('characters:',len(model['characters']),' characters5:',len(model['characters5']),' anchors:',len(model['anchors']))

# --- pure helper -------------------------------------------------------------
people=catalog_people(model)
assert len(people)==len(model['characters'])+len(model['characters5']),len(people)
assert all(c['tier']==6 for c in people[:len(model['characters'])]),'six-star rows come first'
assert all(c['tier']==5 for c in people[len(model['characters']):]),'five-star rows follow'
assert [c['name'] for c in people[:len(model['characters'])]]==[c['name'] for c in model['characters']]
assert [c['name'] for c in people[len(model['characters']):]]==[c['name'] for c in model['characters5']]
for c in people:
    assert set(('name','job','signet','damage','note','recs','tier'))<=set(c),c['name']
    assert all(r.get('active') is False or r.get('anchor') for r in c['recs'])
# copies must not alias the model
people[0]['recs'].clear()
assert model['characters'][0]['recs'],'catalog_people must copy, not alias'
print('OK catalog_people:',len(people),'entries (six-star first, copied not aliased)')

# every five-star character with active recommendations is reachable by name
named5={c['name'] for c in model['characters5'] if any(r['active'] for r in c['recs'])}
assert named5,'the five-star sheet must carry usable recommendations'
sample=sorted(named5)[0]
print('OK five-star characters with recommendations:',len(named5),'| sample:',sample)

# --- headless UI --------------------------------------------------------------
import desktop,ui_v4
from tkinter import ttk

app=desktop.App();app.withdraw()
try:
    app.maintenance_started=True
    app.accept_model((model,False))
    total=len(model['characters'])+len(model['characters5'])
    assert app.people.size()==total,'character view lists both rosters by default'

    def body_texts():
        out=[]
        def walk(w):
            for c in w.winfo_children():
                try:
                    t=c.cget('text')
                    if t:out.append(t)
                except Exception:pass
                walk(c)
        walk(app.catalog_body);return out

    def listed():
        return [app.people.get(i) for i in range(app.people.size())]

    # six-star only keeps the original roster
    app.catalog_source.set('仅六星');app.catalog_source_changed();app.update_idletasks()
    assert listed()==[c['name'] for c in model['characters']],'only-six filter keeps the six-star roster'
    print('OK source=仅六星:',app.people.size(),'characters')

    # five-star only: the whole point of the request
    app.catalog_source.set('仅五星');app.catalog_source_changed();app.update_idletasks()
    assert listed()==[c['name'] for c in model['characters5']],'only-five filter keeps the five-star roster'
    print('OK source=仅五星:',app.people.size(),'characters')

    # a five-star character is searchable by name and opens her anchors
    app.search.set(sample);app.update_idletasks()
    assert listed()==[sample],listed()
    app.people.selection_set(0);app.catalog_select();app.update_idletasks()
    texts=body_texts()
    assert any(t.startswith(sample) for t in texts),'the character title must render'
    assert any('五星探员 · 优先级低于六星' in t for t in texts),texts
    rec_titles=[t for t in texts if '推荐' in t and ('偶像' in t or '图籍' in t or '钥匙' in t)]
    assert rec_titles,'a five-star character must show her recommended anchors'
    print('OK',sample,'opens',len(rec_titles),'recommendation cards as a five-star character')

    # tier words are searchable too
    app.search.set('');app.catalog_source.set('全部');app.catalog_source_changed();app.update_idletasks()
    app.search.set('五星探员');app.update_idletasks()
    assert listed()==[c['name'] for c in model['characters5']],'the tier label is part of the searchable text'
    app.search.set('六星探员');app.update_idletasks()
    assert listed()==[c['name'] for c in model['characters']]
    print('OK tier words searchable: 五星探员 ->',len(model['characters5']),'| 六星探员 ->',len(model['characters']))

    # back to all: both rosters, six-star first
    app.search.set('');app.catalog_source.set('全部');app.catalog_source_changed();app.update_idletasks()
    assert app.people.size()==total
    assert listed()[:len(model['characters'])]==[c['name'] for c in model['characters']]
    print('OK source=全部 restores both rosters, six-star first')

    # switching to anchor mode resets the filter and relabels the picker
    app.catalog_mode.set('心锚');app.switch_catalog_mode();app.update_idletasks()
    assert app.catalog_source.get()=='全部','mode switch must reset the shared filter'
    assert app.source_label.cget('text')=='推荐来源'
    assert app.search.get()==''
    assert app.people.size()>=len(model['anchors'])
    print('OK anchor mode relabels the picker to 推荐来源 and resets the filter')

    # the anchor-side source filter still works through the shared control.
    # Select an anchor that really carries six-star rows: the workbook is
    # maintained externally, so list order and per-anchor rows change over time
    # and the assertion must not depend on whichever anchor happens to be first.
    labels=[app.people.get(i) for i in range(app.people.size())]
    target=next(n for n in labels if anchor_recommendations(model,n)[0])
    app.people.selection_clear(0,'end');app.people.selection_set(labels.index(target))
    app.catalog_select();app.update_idletasks()
    app.anchor_filter.set('仅六星');app.show_anchor();app.update_idletasks()
    six_head=[t for t in body_texts() if t.startswith('六星探员推荐')]
    five_head=[t for t in body_texts() if t.startswith('五星探员推荐')]
    assert six_head and not five_head,'only-six keeps working in anchor mode (%s)'%target
    print('OK shared picker still filters recommendations in anchor mode')

    # and back again: character view survives the round-trip
    app.catalog_mode.set('探员');app.switch_catalog_mode();app.update_idletasks()
    assert app.people.size()==total
    assert app.source_label.cget('text')=='探员来源'
    app.people.selection_set(0);app.catalog_select();app.update_idletasks()
    assert any('推荐' in t or '词条' in t for t in body_texts())
    print('OK character view restored after the anchor round-trip')
finally:
    app.destroy()
print('\nALL 0.6.8 CHECKS PASSED')
