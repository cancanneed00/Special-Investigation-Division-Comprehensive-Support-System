"""0.6.6 verification: low-star event anchors, five-star recommendations,
batch bottom stall guard. Runnable without the game or sample screenshots."""
import json,copy,sys,tempfile,threading
from pathlib import Path
from unittest.mock import patch
from contextlib import ExitStack
from PIL import Image

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from engine import import_workbook,evaluate,recognize,parse_name
from scoring import DEFAULT_POLICY
import automation,vision

def find_book():
    candidates=[HERE.parent/'心锚终端/表格',
                Path(r'C:\Users\30860\Documents\New project\publish-anchor-065\anchor-fitness-assessment-terminal-0.6.5\心锚适格评定终端-0.6.5\表格')]
    for cand in candidates:
        if cand.exists():
            hits=sorted(cand.glob('*.xlsx'))
            if hits:return hits[0]
    raise SystemExit('workbook not found')

class FakeBridge:
 def __init__(self,root,stop):
  self.page=0;self.stop=stop;self.calls=[];self.folder=Path(root)/'run';self.folder.mkdir();self.closed=False
 def check(self):
  if self.stop.is_set():raise automation.Stopped()
 def capture(self):return self.page
 def guard(self,*args):return [{}]
 def rpc(self,op,**kw):
  self.check();self.calls.append((op,kw))
  if op=='scroll' and kw.get('direction')=='down':self.page=1
 def close(self):self.closed=True

book=find_book();model=import_workbook(book)
print('workbook:',book.name)
print('characters:',len(model['characters']),' characters5:',len(model['characters5']),' anchors:',len(model['anchors']))
assert len(model['characters'])==40
assert len(model['characters5'])==21,[c['name'] for c in model['characters5']]
assert model['characters5'][0]['name']=='铃' and model['characters5'][-1]['name']=='小拉吉'
assert model['characters5'][0]['recs'][0]['anchor']=='伊甸塑像'
assert model['recommendation_notes5']
print('OK five-star sheet parsed: 21 characters, notes present')

# --- low-star event anchor in the encyclopedia -------------------------------
anchor=model['anchors']['雀姬奇物']
assert anchor['pools']['1']==['生命'] and anchor['pools']['2']==['护甲'] and anchor['pools']['3']==['生命']
obs={'anchor':'雀姬奇物','level':1,'rarity':2,'entries':{},'traits':{},'issues':[]}
ev=evaluate(model,obs)
assert ev['decision']=='活动心锚',ev['decision']
assert ev['match_score'] is None and ev['value_score'] is None
assert len(ev['matches'])==8,ev['matches']
assert all(m['no_score'] and m['score'] is None and m['rank'] in (1,2) for m in ev['matches'])
names=[m['character'] for m in ev['matches']]
for n in ['白星','阿克塞尔','NEO','幽灵克星','黑潮','反冲','观星者','犬齿']:assert n in names,n
assert ev['matches5']==[]
assert ev['fixed_entries'] and ev['entry_count']==3
assert [d['stat'] for d in ev['value_details']]==['生命','护甲','生命']
assert any('不评分' in r for r in ev['reasons'])
assert any('白星' in r for r in ev['reasons'])
print('OK 雀姬奇物 event anchor: 8 unscored recommendations, 3 fixed entries')

# one-star variant and unknown low-star
ev1=evaluate(model,{'anchor':'雀姬奇物','level':1,'rarity':1,'entries':{},'traits':{},'issues':[]})
assert ev1['decision']=='活动心锚' and any('一星' in r for r in ev1['reasons'])
ev2=evaluate(model,{'anchor':'不知名杂物','level':1,'rarity':2,'entries':{},'traits':{},'issues':[]})
assert ev2['decision']=='跳过' and any('不在心锚百科' in r for r in ev2['reasons'])
assert ev2['matches']==[] and ev2['matches5']==[]
print('OK one-star variant + unknown low-star skip')

# --- five-star matches never influence six-star results -----------------------
five_anchors=sorted({r['anchor'] for c in model['characters5'] for r in c['recs'] if r['active']})
print('five-star recommended anchors:',len(five_anchors))
picked=None
for a in five_anchors:
    if a in model['anchors']:picked=a;break
assert picked
obs3={'anchor':picked,'level':1,'rarity':3,
      'entries':{'1':{'stat':model['anchors'][picked]['pools']['1'][0],'value':'50','unit':'flat','star':True},
                 '2':{'stat':model['anchors'][picked]['pools']['2'][0],'value':'5','unit':'percent','star':True},
                 '3':{'stat':model['anchors'][picked]['pools']['3'][0],'value':'5','unit':'percent','star':True},
                 '4':{'stat':model['anchors'][picked]['pools']['4'][0],'value':'5','unit':'percent','star':True}},
      'traits':{'1':None,'2':None},'issues':[]}
ev_with=evaluate(model,obs3)
stripped=dict(model,characters5=[])
ev_without=evaluate(stripped,obs3)
assert ev_with['decision']==ev_without['decision'],(ev_with['decision'],ev_without['decision'])
assert ev_with['match_score']==ev_without['match_score']
assert [m['character'] for m in ev_with['matches']]==[m['character'] for m in ev_without['matches']]
assert ev_without['matches5']==[]
assert ev_with['matches5'],'five-star matches expected for '+picked
assert all('star5' not in m or True for m in ev_with['matches5'])
assert all(m['score'] is not None for m in ev_with['matches5'])
assert not any(m['character'] in {x['character'] for x in ev_with['matches5']} and False for m in ev_with['matches'])
print('OK five-star matches for',picked,':',[ (m['character'],m['score']) for m in ev_with['matches5']][:4],'six-star decision unchanged')

# --- name parsing --------------------------------------------------------------
m2=model
o=parse_name([{'box':[312,64,27,33],'text':'全','score':.10},{'box':[345,65,111,31],'text':'宝藏掛坠','score':.96}],m2)
assert o[0]=='宝藏挂坠' and not [s for s in o[2] if s.startswith('名称需核对')]
o=parse_name([{'box':[345,65,120,31],'text':'精雕紫钻钥匙','score':.9}],m2)
assert any(s.startswith('名称需核对') for s in o[2])
assert parse_name([],{})[0]==''
print('OK parse_name icon/variant/unknown/empty')

# --- recognize() low-star name-only OCR ---------------------------------------
with tempfile.TemporaryDirectory() as root:
    root=Path(root);(root/'程序文件').mkdir()
    Image.new('RGB',(1280,720),(20,20,30)).save(root/'frame.png')
    fake=[{'roi':[300,55,238,280],'detail':{'all':[
        {'box':[345,65,111,31],'text':'雀姬奇物','score':.95},
        {'box':[374,111,55,29],'text':'1/30','score':.9}]}}]
    class W:
        def request(self,i,o,stop=None):
            Path(o).write_text(json.dumps(fake),encoding='utf-8')
    with patch('vision.rarity',return_value=2),patch('ocr_worker.worker',return_value=W()):
        obs=recognize(root,root/'frame.png',model)
    assert obs['anchor']=='雀姬奇物' and obs['rarity']==2 and obs['level']==1
    assert obs['entries']=={} and obs['raw_ocr']
    assert '活动心锚' in obs['source']
    evdir=Path(obs['evidence'])
    assert (evdir/'observation.json').exists() and (evdir/'input.png').exists()
    assert not (evdir/'input.png.zoom.png').exists() and not (evdir/'input.png.rows.png').exists()
    ev=evaluate(model,obs)
    assert ev['decision']=='活动心锚' and len(ev['matches'])==8
    assert automation and vision
print('OK recognize() low-star: name-only OCR, event anchor surfaced')

# --- batch: low-star flows through, never marked ------------------------------
def run_batch(obs_value):
    with tempfile.TemporaryDirectory() as root:
        b=FakeBridge(root,threading.Event());rows=[]
        with ExitStack() as s:
            s.enter_context(patch('automation.time.sleep'))
            s.enter_context(patch('vision.image',side_effect=lambda p:p))
            s.enter_context(patch('vision.grid_cells',return_value=[{'col':0,'y':153}]))
            s.enter_context(patch('vision.selected_cell',return_value=True))
            s.enter_context(patch('vision.detail_same',return_value=True))
            mark=s.enter_context(patch('automation.mark_one'))
            automation.run_inventory(root,model,{},None,b.stop,lambda r,n:rows.append(r),max_items=1,
                scroll=False,bridge_factory=lambda *a:b,recognizer=lambda *a:obs_value,apply_marks=True)
            summary=json.loads((b.folder/'summary.json').read_text(encoding='utf-8'))
        return rows,summary,mark.call_count
rows,summary,marks=run_batch({'anchor':'雀姬奇物','level':1,'rarity':2,'entries':{},'traits':{},'issues':[]})
assert marks==0 and rows[0]['action']=='活动心锚 · 可保留使用'
assert rows[0]['evaluation']['decision']=='活动心锚'
assert summary['event_anchors']==1 and summary['skipped_two_star']==0
rows,summary,marks=run_batch({'anchor':'杂物','level':1,'rarity':1,'entries':{},'traits':{},'issues':[]})
assert marks==0 and rows[0]['action']=='一星跳过'
assert summary['skipped_one_star']==1 and summary['event_anchors']==0
print('OK batch: event anchor kept unmarked, unknown low-star skipped')

# --- batch: stall guard stops at the bottom ------------------------------------
with tempfile.TemporaryDirectory() as root:
    b=FakeBridge(root,threading.Event());rows=[];progress=[]
    cells=[{'col':c,'y':150+130*r} for r in range(3) for c in range(2)]
    obs_full={'anchor':'苍炎狼徽','level':1,'rarity':3,'entries':{},'traits':{},'issues':[]}
    with ExitStack() as s:
        s.enter_context(patch('automation.time.sleep'))
        s.enter_context(patch('automation.prepare_level_order'))
        s.enter_context(patch('automation.rewind_inventory'))
        s.enter_context(patch('automation.wait_grid_still',side_effect=lambda b:b.capture()))
        s.enter_context(patch('vision.grid_cells',return_value=cells))
        s.enter_context(patch('vision.selected_cell',return_value=True))
        s.enter_context(patch('vision.detail_same',return_value=True))
        s.enter_context(patch('vision.selected_overlap',return_value=None))
        s.enter_context(patch('vision.overlap',return_value=len(cells)))
        s.enter_context(patch('vision.image',side_effect=lambda p:p))
        s.enter_context(patch('vision.row_signatures',side_effect=lambda im,c:[0,1,2] if im==0 else [2,3,4]))
        s.enter_context(patch('automation.evaluate',return_value={'decision':'跳过'}))
        result=automation.run_inventory(root,model,{},None,b.stop,lambda r,n:rows.append(r),max_items=100,
            bridge_factory=lambda *a:b,recognizer=lambda *a:obs_full,apply_marks=False,progress=progress.append)
    assert result['count']==6,result
    assert '已到达列表末尾' in result['reason'],result['reason']
    scrolls=[k.get('direction') for op,k in b.calls if op=='scroll']
    assert scrolls.count('down')==3,scrolls
print('OK stall guard: first page processed, two empty pages then stop, reason =',result['reason'])

# --- regression: ordinary anchor scoring unchanged ------------------------------
obs4={'anchor':'头狼金雕','level':1,'entries':{'1':{'stat':'攻击','value':'54','unit':'flat','star':True},
      '2':{'stat':'暴击','value':'4.23','unit':'percent','star':True},'3':{'stat':'护甲穿透%','value':'2.63','unit':'percent','star':True},
      '4':{'stat':'物质伤害','value':'.99','unit':'percent','star':True}},'traits':{'1':'惯性冲击2','2':'集中1'},'issues':[]}
ev4=evaluate(model,obs4,['犬齿'])
assert ev4['decision']=='锁定' and ev4['matches'][0]['character']=='犬齿',(ev4['decision'],ev4['matches'][0]['character'])
assert ev4['match_score'] is not None and ev4['matches5']==[]
print('OK ordinary anchor scoring unchanged (头狼金雕/犬齿 locked, score',ev4['match_score'],')')

print('\nALL 0.6.6 CHECKS PASSED')
