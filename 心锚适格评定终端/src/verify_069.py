"""0.6.11 verification: non-level-1 anchors are scored, never marked.

Covers
  1. the level-growth ratio tables (three caps: 10 / 20 / 30)
  2. reverse mapping of real screenshot values back to 1-level equivalents
  3. activity / top-up anchors short-circuit to a full 100 score
  4. evaluate() decisions at level 1 / 10 / 20
  5. headless Tk rendering of a "score only" item
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import anchor_curve as ac
from engine import Store, import_workbook, evaluate
import desktop, ui_v4

ROOT = HERE.parent


def find_book():
    for cand in [ROOT / '表格',
                 Path(r'D:\异象回声终端\工程\publish-anchor-065\test-0610\心锚适格评定终端-0.6.10\表格'),
                 Path(r'D:\异象回声终端\工程\publish-anchor-065\test-068\心锚适格评定终端-0.6.8\表格')]:
        hits = sorted(cand.glob('*.xlsx'))
        if hits:
            return hits[0]
    raise SystemExit('workbook not found')


book = find_book()
model = import_workbook(book)
print('workbook:', book.name, '| rules:', len(model['rules']), '| anchors:', len(model['anchors']))

# --- 1. ratio tables ---------------------------------------------------------
for n, table in ac.RATIO.items():
    assert len(table) == n, (n, len(table))
    assert table[0] == 0 and table[-1] == 100000, (n, table[0], table[-1])
    assert table == sorted(table), 'ratio must be monotonic for N=%d' % n
    assert len(set(table)) == n, 'ratio must be strictly increasing for N=%d' % n
assert ac.GROWTH == {10: 2.0, 20: 2.5, 30: 10 / 3}
assert ac.ratio_of(30, 29) == 0.98214, ac.ratio_of(30, 29)
assert ac.ratio_of(30, 1) == 0.0 and ac.ratio_of(30, 30) == 1.0
print('OK ratio tables: N=10/20/30, L29 = 98214 (not the naive 96552)')

# --- 2. reverse mapping of real screenshot values ---------------------------
DUJIA_L1 = {'1': ('护甲', '34', 'flat'), '2': ('暴击', '2.63', 'percent'),
            '3': ('物质伤害', '1.2', 'percent'), '4': ('技能威力', '1', 'percent')}
DUJIA_L10 = {'1': ('护甲', '59', 'flat'), '2': ('暴击', '4.61', 'percent'),
             '3': ('物质伤害', '2.1', 'percent'), '4': ('技能威力', '1.74', 'percent')}
DUJIA_L20 = {'1': ('护甲', '88', 'flat'), '2': ('暴击', '6.82', 'percent'),
             '3': ('物质伤害', '3.1', 'percent'), '4': ('技能威力', '2.55', 'percent')}
expected = {'1': (34, 1), '2': (2.63, 3), '3': (1.2, 1), '4': (1, 1)}
for level, rows in ((10, DUJIA_L10), (20, DUJIA_L20)):
    for key, (stat, value, unit) in rows.items():
        est = ac.estimate_level1(model['rules'], 2, int(key), stat, unit, value,
                                 level, ac.levels_of('度假指南'))
        want, want_tier = expected[key]
        assert est and est['tier'] == want_tier, (level, key, stat, est)
        assert abs(float(est['value']) - want) < 0.01, (level, key, est)
print('OK 度假指南: level 10 and level 20 both map back to 34 / 2.63 / 1.2 / 1')

# 狮王金雕 20 级：攻击139 护甲58 警戒威力4.56 物质伤害2.55 → 第1/1/3/1档
for key, (stat, value, unit, tier, l1) in {
        '1': ('攻击', '139', 'flat', 1, 54),
        '2': ('护甲', '58', 'flat', 1, 22),
        '3': ('警戒威力', '4.56', 'percent', 3, 1.76),
        '4': ('物质伤害', '2.55', 'percent', 1, 0.99)}.items():
    est = ac.estimate_level1(model['rules'], 1, int(key), stat, unit, value, 20,
                             ac.levels_of('狮王金雕'))
    assert est and est['tier'] == tier, (key, stat, est)
    assert abs(float(est['value']) - l1) < 0.02, (key, stat, est)
print('OK 狮王金雕: level 20 maps back to the screenshot 1-level values')

# --- 3. fixed-value anchors -------------------------------------------------
FIXED = [n for n, a in model['anchors'].items() if ac.is_fixed_anchor(a.get('origin'))]
assert len(FIXED) >= 6, FIXED
for name in FIXED:
    a = model['anchors'][name]
    ev = evaluate(model, {'anchor': name, 'level': 1, 'rarity': 3, 'entries': {},
                          'traits': {}, 'issues': []})
    assert ev['decision'] == '活动心锚', (name, ev['decision'])
    assert ev['value_score'] == 100 and ev['value_range'] == [100, 100], name
    assert ev.get('fixed_full') and ev['match_score'] is None, name
print('OK fixed-value anchors (%d): score 100, no level curve, no match score' % len(FIXED))


# --- 4. evaluate decisions --------------------------------------------------
def obs_of(name, level, rows):
    a = model['anchors'][name]
    return {'anchor': name, 'level': level, 'level_cap': ac.levels_of(name), 'rarity': 3,
            'entries': {k: dict(stat=s, value=v, unit=u, star=None) for k, (s, v, u) in rows.items()},
            'traits': {'1': None, '2': None}, 'issues': [],
            'presence': {k: 'present' for k in rows},
            'trait_presence': {'1': 'unknown', '2': 'unknown'}}


lvl1 = evaluate(model, obs_of('度假指南', 1, DUJIA_L1))
assert lvl1['decision'] in ('锁定', '跳过', '跳过复核', '标记放弃'), lvl1['decision']
scores = []
for level, rows in ((10, DUJIA_L10), (20, DUJIA_L20)):
    ev = evaluate(model, obs_of('度假指南', level, rows))
    assert ev['decision'] == '仅评分', (level, ev['decision'])
    assert any('不做保留 / 放弃标记' in r for r in ev['reasons']), level
    assert all(d.get('level1') for d in ev['value_details']), level
    scores.append(ev['value_score'])
assert scores[0] == scores[1] == lvl1['value_score'], (scores, lvl1['value_score'])
print('OK evaluate: 1级 -> %s, 10/20级 -> 仅评分, value score identical (%.2f)'
      % (lvl1['decision'], lvl1['value_score']))

# a level-1 anchor with the same numbers is still allowed to be marked
assert lvl1['decision'] != '仅评分'
print('OK level 1 keeps the original lock/discard path')

# --- 5. headless Tk ---------------------------------------------------------
app = desktop.App()
app.withdraw()
try:
    app.maintenance_started = True
    app.accept_model((model, False))
    ev = evaluate(model, obs_of('度假指南', 20, DUJIA_L20))
    app.display(dict(obs_of('度假指南', 20, DUJIA_L20), image=str(book)), ev)
    assert '仅评分' in app.decision.get(), app.decision.get()
    assert '按档位评分' in app.scoresvar.get(), app.scoresvar.get()
    values = [app.fields.item(i, 'values') for i in app.fields.get_children()]
    assert any('档' in str(v[3]) for v in values if v), values
    assert '仅评分' in ui_v4.brief(ev), ui_v4.brief(ev)
    print('OK headless Tk: decision / score line / field table show tier (no level-1 value)')
finally:
    app.destroy()
print('\n0.6.11 verification passed')
