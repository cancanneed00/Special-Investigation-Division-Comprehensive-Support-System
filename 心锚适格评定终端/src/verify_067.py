"""0.6.7 verification: anchor-first catalog view (searchable, six-star
priority, five/six-star source filter) and the details-dialog jump.
Runnable without the game or sample screenshots."""
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from engine import import_workbook,anchor_recommendations,catalog_anchors

def find_book():
    for cand in [HERE.parent/'表格',
                 Path(r'C:\Users\30860\Documents\New project\publish-anchor-065\anchor-fitness-assessment-terminal-0.6.5\心锚适格评定终端-0.6.5\表格')]:
        if cand.exists():
            hits=sorted(cand.glob('*.xlsx'))
            if hits:return hits[0]
    raise SystemExit('workbook not found')

book=find_book();model=import_workbook(book)
print('workbook:',book.name)
print('characters:',len(model['characters']),' characters5:',len(model['characters5']),' anchors:',len(model['anchors']))

# --- pure helpers -------------------------------------------------------------
names=catalog_anchors(model)
assert names==sorted(names),'catalog list must be sorted for predictable search'
assert set(model['anchors'])<=set(names),'every encyclopedia anchor is listable'
assert len(names)>=len(model['anchors'])
print('OK catalog_anchors:',len(names),'entries (encyclopedia',len(model['anchors']),')')

# a recommendation pointing outside the encyclopedia still shows up
broken=dict(model,characters=[dict(model['characters'][0],recs=[dict(model['characters'][0]['recs'][0],anchor='不存在的幻影心锚',active=True)])])
assert '不存在的幻影心锚' in catalog_anchors(broken)
print('OK catalog_anchors includes recommended-but-unknown names')

both=None;only6=None;only5=None;none=None
for name in names:
    six,five=anchor_recommendations(model,name)
    assert all(r['anchor']==name and r['active'] for _,r in six+five)
    assert all(c in model['characters'] for c,_ in six)
    assert all(c in model['characters5'] for c,_ in five)
    if six and five and both is None:both=name
    if six and not five and only6 is None:only6=name
    if five and not six and only5 is None:only5=name
    if not six and not five and none is None:none=name
assert both and only6 and only5 and none,(both,only6,only5,none)
print('OK anchor_recommendations splits the two sheets for',len(names),'anchors')
print('   sample: both =',both,'| six-only =',only6,'| five-only =',only5,'| none =',none)

six,five=anchor_recommendations(model,'雀姬奇物')
assert len(six)==8 and five==[]
assert [c['name'] for c,_ in six][:3]
print('OK 雀姬奇物: 8 six-star recommendations, no five-star rows')

# --- headless UI --------------------------------------------------------------
import desktop,ui_v4
from tkinter import ttk

ROOT=HERE.parent
app=desktop.App();app.withdraw()
try:
    app.maintenance_started=True
    app.accept_model((model,False))
    assert app.people.size()==40,'character mode keeps the six-star roster'

    # switch to anchor mode: the list becomes the searchable anchor catalog
    app.switch_catalog_mode()
    app.catalog_mode.set('心锚');app.filter_chars()
    listed=[app.people.get(i) for i in range(app.people.size())]
    assert listed==names,(len(listed),len(names))
    app.people.selection_set(0);app.catalog_select();app.update_idletasks()
    print('OK anchor mode lists all',len(listed),'anchors')

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

    # search narrows the list; jump selects the exact anchor
    app.search.set(both[:2]);app.update_idletasks()
    assert 0<app.people.size()<len(names),'search must narrow the anchor list'
    app.search.set('');app.update_idletasks()
    app.jump_to_catalog(both)
    assert app.catalog_mode.get()=='心锚'
    assert app.people.get(app.people.curselection()[0])==both
    texts=body_texts()
    six_head=[t for t in texts if t.startswith('六星探员推荐')]
    five_head=[t for t in texts if t.startswith('五星探员推荐')]
    assert six_head and five_head,'both blocks expected for '+both
    assert texts.index(six_head[0])<texts.index(five_head[0]),'six-star block must come first'
    assert '六星优先展示' in texts
    assert '优先级低于六星' in five_head[0]
    print('OK',both,': six-star block rendered before the five-star block')

    # source filter: only six / only five
    app.anchor_filter.set('仅六星');app.show_anchor();app.update_idletasks()
    texts=body_texts()
    assert any(t.startswith('六星探员推荐') for t in texts) and not any(t.startswith('五星探员推荐') for t in texts)
    app.anchor_filter.set('仅五星');app.show_anchor();app.update_idletasks()
    texts=body_texts()
    assert any(t.startswith('五星探员推荐') for t in texts) and not any(t.startswith('六星探员推荐') for t in texts)
    print('OK source filter separates six-star and five-star blocks')

    # five-only and no-recommendation anchors render without crashing
    app.anchor_filter.set('全部');app.jump_to_catalog(only5)
    texts=body_texts()
    assert any(t.startswith('五星探员推荐') for t in texts) and not any(t.startswith('六星探员推荐') for t in texts)
    assert any('优先级低于六星' in t for t in texts)
    app.jump_to_catalog(none)
    assert any('暂无探员推荐' in t for t in body_texts())
    print('OK five-only and unrecommended anchors render with the right hints')

    # unknown name reports instead of silently selecting nothing
    app.jump_to_catalog('不存在的幻影心锚')
    assert '图鉴中未找到' in app.status.get(),app.status.get()
    print('OK unknown anchor name reports in the status bar')

    # back to character mode: the roster is restored
    app.catalog_mode.set('探员');app.switch_catalog_mode()
    assert app.people.size()==40
    app.people.selection_set(0);app.catalog_select();app.update_idletasks()
    assert any('推荐' in t or '词条' in t for t in body_texts())
    print('OK character mode unchanged after the anchor round-trip')
finally:
    app.destroy()
print('\nALL 0.6.7 CHECKS PASSED')
