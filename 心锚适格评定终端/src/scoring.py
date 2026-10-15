"""Independent value quality and agent affinity; configurable rule predicates."""
from decimal import Decimal
import math
import copy,re
from engine import classify,preference

DEFAULT_POLICY={'version':2,
 'keep':{'enabled':True,'match_threshold':80,'max_tier':2,'min_bottom_tiers':2,'ordinary_tier':3,'perfect_enabled':True,'perfect_threshold':95},
 'discard':{'enabled':True,'count_enabled':True,'min_entries':3,'low_enabled':True,'worst_tier':4,'joint_enabled':True,'joint_value':95,'joint_match':70,'weak_enabled':True,'weak_value':85}}

def validate_policy(policy):
 p=copy.deepcopy(policy)
 if p.get('version')!=2:
  old=p;p=copy.deepcopy(DEFAULT_POLICY)
  for action in ('keep','discard'):
   r=old.get(action,{})
   p[action]['enabled']=bool(r.get('value_enabled',True) or r.get('match_enabled',True))
  p['keep']['match_threshold']=old.get('keep',{}).get('match_threshold',80)
 p['keep'].setdefault('perfect_enabled',True);p['keep'].setdefault('perfect_threshold',95)
 for key in ('joint_enabled','joint_value','joint_match','weak_enabled','weak_value'):
  p['discard'].setdefault(key,DEFAULT_POLICY['discard'][key])
 for key in ('joint_value','joint_match','weak_value'):
  v=float(p['discard'][key])
  if not math.isfinite(v) or not 0<=v<=100:raise ValueError(key+' 必须为0至100')
  p['discard'][key]=v
 perfect=float(p['keep']['perfect_threshold'])
 if not math.isfinite(perfect) or not 0<=perfect<=100:raise ValueError('直接保留阈值必须为0至100')
 p['keep']['perfect_threshold']=perfect
 x=float(p['keep']['match_threshold'])
 if not math.isfinite(x) or not 0<=x<=100:raise ValueError('匹配分阈值必须为0至100')
 p['keep']['match_threshold']=x
 for action,key,low,high in [('keep','max_tier',1,2),('keep','min_bottom_tiers',1,2),('keep','ordinary_tier',1,3),('discard','min_entries',2,4),('discard','worst_tier',4,6)]:
  x=float(p[action][key])
  if not math.isfinite(x) or not x.is_integer() or not low<=x<=high:raise ValueError(key+' 必须为 '+str(low)+'—'+str(high)+' 的整数')
  p[action][key]=int(x)
 return p

def tier_evidence(model,slot,pos,item):
 """Preserve variant ambiguity; a value between tiers spans both adjacent tiers."""
 t=classify(model,slot,pos,item['stat'],item.get('value'),item.get('unit'),item.get('star'))
 rules=[r for r in model['rules'] if (r['slot'],r['pos'],r['stat'],r['unit'])==(slot,pos,item['stat'],item.get('unit'))]
 candidates=[]
 for r in rules:
  hits=[h['tier'] for h in t.get('candidates',[]) if h['variant']==r['variant']]
  vals=sorted(r['values'],key=lambda v:v['tier']);last=max(v['tier'] for v in vals)
  if hits:candidates.append({'tiers':hits,'last':last,'variant':r['variant']});continue
  try:v=Decimal(str(item['value']))
  except Exception:continue
  if not v.is_finite() or v<=0:continue
  if pos==4:
   if item.get('star') is not False:candidates.append({'tiers':[1],'last':1,'variant':r['variant']})
   continue
  if item.get('star') is True:continue # A gold star cannot support an interpolated low tier.
  for a,b in zip(vals,vals[1:]):
   if Decimal(a['value'])>v>Decimal(b['value']):
    candidates.append({'tiers':[a['tier'],b['tier']],'last':last,'variant':r['variant']});break
 tiers=sorted({n for c in candidates for n in c['tiers']})
 return {'candidates':candidates,'tiers':tiers,'text':' / '.join(str(n)+'档' for n in tiers) if tiers else t['text']}

def tier_pass(evidence,cut,direction='max'):
 flags=[(n<=cut if direction=='max' else c['last']-n+1<=cut) for c in evidence['candidates'] for n in c['tiers']]
 return True if flags and all(flags) else False if flags and not any(flags) else None

def matched_token(entry,actual,legal):
 explicit={t['t'] for t in entry['tokens'] if not t['others']}
 return next((t for t in entry['tokens'] if t['t']==actual or (t['others'] and actual in legal and actual not in explicit)),None)

def recommendation_gate(rec,anchor,rows,traits,evidence,note,policy):
 checks=[]
 for e in rec['entries']:
  if e['kind']=='trait':continue # Traits are annotations, never scoring/retention gates.
  key=str(e['idx']);is_entry=e['kind']=='entry';obj=rows.get(key) if is_entry else traits.get(key)
  actual=obj['stat'] if is_entry and obj else obj if not is_entry else None
  legal=anchor['pools'][key] if is_entry else anchor['traits'][key]
  token=matched_token(e,actual,legal);label=('词条' if is_entry else '特性')+key
  red=[t for t in e['tokens'] if t['red']]
  important=any(t['bold'] or t['red'] for t in e['tokens'])
  direction=token['direction'] if token else 'max'
  if is_entry and actual and actual.startswith('生命') and '生命词条越低越好' in note:direction='min'
  relaxed=bool(e['all_equal'] or token and (token.get('unimportant') or token['others']))
  if is_entry and actual and re.search('对'+re.escape(actual)+r'词条可放低要求',note):relaxed=True
  if red and (not token or not token['red']):
   checks.append({'label':label,'pass':False,'reason':'红字不可替代要求未满足','source':e['source']});continue
  if not is_entry:
   if important:checks.append({'label':label,'pass':bool(token),'reason':'重要特性匹配' if token else '重要特性未匹配','source':e['source']})
   continue
  if direction=='min':
   passed=tier_pass(evidence.get(key,{'candidates':[]}),policy['min_bottom_tiers'],'min') if obj else False
   why='min 越低越好，要求最低 '+str(policy['min_bottom_tiers'])+' 档'
  elif important and not relaxed:
   passed=tier_pass(evidence.get(key,{'candidates':[]}),policy['max_tier']) if token else False
   why='重要词条须匹配且达到前 '+str(policy['max_tier'])+' 档'
  else:
   passed=tier_pass(evidence.get(key,{'candidates':[]}),policy['ordinary_tier']) if obj else True
   why='非重要 / 皆可词条允许前 '+str(policy['ordinary_tier'])+' 档；单条低档不触发放弃' if obj else '非重要 / 皆可词条缺失由总词条数量规则处理'
  if obj:why+='；实际 '+evidence.get(key,{}).get('text','档位未确定')
  checks.append({'label':label,'pass':passed,'reason':why,'source':e['source']})
 flags=[c['pass'] for c in checks]
 return (False if False in flags else None if None in flags else True),checks

def quality_filter(obs,evidence,policy):
 reasons=[];uncertain=False
 count=sum(bool(v) for v in obs.get('entries',{}).values())
 missing_known=all(obs.get('entries',{}).get(str(i)) or obs.get('presence',{}).get(str(i))=='absent' for i in range(1,5))
 if policy['count_enabled']:
  if not missing_known:uncertain=True
  elif count<policy['min_entries']:reasons.append('仅有 '+str(count)+' 条词条，低于 '+str(policy['min_entries'])+' 条要求')
 if policy['low_enabled']:
  flags=[]
  for key,item in obs.get('entries',{}).items():
   if not item:continue
   tiers=evidence.get(key,{}).get('tiers',[])
   flags.append(True if tiers and min(tiers)>=policy['worst_tier'] else False if tiers and max(tiers)<policy['worst_tier'] else None)
  if flags and all(f is True for f in flags):reasons.append('全部现有词条均为 '+str(policy['worst_tier'])+' 档或更低')
  elif False not in flags:uncertain=True
 return {'bad':True if reasons else None if uncertain else False,'reasons':reasons,'count_too_low':missing_known and count<policy['min_entries'] and policy['count_enabled']}

def decide(quality,choices,policy,issues=(),value_range=None):
 p=validate_policy(policy)
 if issues:return '跳过复核','识别或数据不确定，不执行标记'
 keep=p['keep']['enabled'];drop=p['discard']['enabled']
 eligible=[c for c in choices if c['score']>=p['keep']['match_threshold'] and c.get('gate_pass') is True]
 pending=[c for c in choices if c['score']>=p['keep']['match_threshold'] and c.get('gate_pass') is None]
 if drop and quality['count_too_low']:return '标记放弃','；'.join(quality['reasons'])
 if p['keep']['perfect_enabled'] and value_range:
  if value_range[0]>p['keep']['perfect_threshold']:return '锁定','数值分高于 '+str(p['keep']['perfect_threshold'])+'，直接保留（不依赖推荐匹配）'
  if value_range[1]>p['keep']['perfect_threshold']:return '跳过复核','数值分区间跨越直接保留阈值'
 if keep and eligible:return '锁定',eligible[0]['character']+'：匹配达标且重要词条 / min 档位条件通过'
 if keep and pending:return '跳过复核','推荐保留的档位跨界或未确定'
 if drop and quality['bad'] is True:return '标记放弃','；'.join(quality['reasons'])
 if drop and quality['bad'] is None:return '跳过复核','独立数值筛选存在档位或缺条歧义'
 # Valid recommendation/min builds remain protected even with keep marking disabled.
 if drop and not eligible and not pending and value_range:
  d=p['discard'];match=max((c['score'] for c in choices),default=0)
  def low(q):return (d['joint_enabled'] and q<d['joint_value'] and match<d['joint_match']) or (d['weak_enabled'] and q<d['weak_value'])
  if low(value_range[1]):
   return '标记放弃',('匹配低且数值不突出' if d['joint_enabled'] and match<d['joint_match'] and value_range[1]<d['joint_value'] else '未满足推荐保留，整体数值偏低')+f'（数值≤{value_range[1]:g}，匹配{match:g}）'
  if low(value_range[0]):return '跳过复核','数值区间跨越放弃阈值'
 if keep and any(c['score']>=p['keep']['match_threshold'] for c in choices):
  best=max((c for c in choices if c['score']>=p['keep']['match_threshold']),key=lambda c:c['score'])
  return '跳过',best['character']+'匹配分达标，但保留条件未通过：'+best['reason']
 return '跳过','未满足推荐保留条件，也未命中独立低质量筛选'

def evaluate_dual(model,obs,selected=None,policy=None):
 policy=validate_policy(policy or DEFAULT_POLICY)
 anchor=model['anchors'].get(obs.get('anchor'));issues=[s for s in obs.get('issues',[]) if not s.startswith('特性')]
 base={'value_score':None,'value_range':None,'value_details':[],'entry_count':sum(bool(x) for x in obs.get('entries',{}).values()),
       'matches':[],'match_score':None,'decision':'跳过复核','reasons':issues,'value_notes':[],'rule_hash':model['hash'],'policy':policy}
 if obs.get('rarity') in (1,2):
  base.update(decision='跳过',reasons=[('一星' if obs['rarity']==1 else '二星')+'心锚直接跳过']);return base
 if obs.get('level') not in (1,30):
  base.update(decision='跳过' if isinstance(obs.get('level'),int) else '跳过复核',reasons=['仅支持1级或30级评分；仓库仅处理1级']);return base
 if obs.get('level')==30:
  model=dict(model,rules=[dict(r,values=r['values30']) for r in model['rules'] if r.get('values30') and any(v['tier']==1 for v in r['values30'])])
 if not anchor:issues.append('未知心锚');return base
 rows=obs.get('entries',{});traits=obs.get('traits',{});ratios=[];evidence={};all_choices=[];weights={1:.4,2:.3,3:.2,4:.1}
 for i in range(1,5):
  key=str(i);item=rows.get(key)
  if item is None:
   if i<3:issues.append('固定词条'+key+'缺失')
   elif obs.get('presence',{}).get(key)!='absent':issues.append('词条'+key+'空缺未确认')
   continue
  if item['stat'] not in anchor['pools'][key]:issues.append('词条'+key+'不在该心锚候选池')
  t=classify(model,anchor['slot'],i,item['stat'],item.get('value'),item.get('unit'),item.get('star'))
  evidence[key]=tier_evidence(model,anchor['slot'],i,item)
  scores=[];basis='表内档位'
  for candidate in t.get('candidates',[]):
   rule=next(r for r in model['rules'] if r['variant']==candidate['variant'] and r['slot']==anchor['slot'] and r['pos']==i)
   maximum=next(Decimal(v['value']) for v in rule['values'] if v['tier']==1)
   # A matched first-tier endpoint includes documented display rounding.
   scores.append(1.0 if candidate['tier']==1 else min(1.0,float(Decimal(str(item['value']))/maximum)))
  variants={c['variant'] for c in evidence[key]['candidates']}
  if variants:
   scores=[]
   for rule in model['rules']:
    if rule['slot']==anchor['slot'] and rule['pos']==i and rule['variant'] in variants and rule['unit']==item['unit']:
     maximum=next(Decimal(v['value']) for v in rule['values'] if v['tier']==1)
     exact_top=any(c['variant']==rule['variant'] and c['tier']==1 for c in t.get('candidates',[]))
     scores.append(1.0 if exact_top or i==4 else min(1.0,float(Decimal(str(item['value']))/maximum)))
  if not scores:
   # Quality is closeness to the maximum, not membership in a discrete tier list.
   # The source explicitly says it is handwritten and small variations are not all listed.
   from engine import value_quality
   fallback=value_quality(model,anchor['slot'],i,item['stat'],item.get('value'),item.get('unit'))
   scores=fallback['scores'];basis=fallback['basis']
   if scores:base['value_notes'].append('词条'+key+'：'+basis)
  if scores:ratios.append((min(scores),max(scores),weights[i]))
  else:issues.append('词条'+key+' '+item['stat']+' '+str(item['value'])+'：'+basis)
  base['value_details'].append({'position':i,'stat':item['stat'],'value':item['value'],'unit':item['unit'],'tier':evidence[key]['text'],'tier_candidates':evidence[key]['candidates'],
       'score_range':[round(min(scores)*100,2),round(max(scores)*100,2)] if scores else None,'star':item.get('star'),'basis':basis})
 if len(ratios)==base['entry_count'] and len(ratios)>=2:
  coverage=min(1,base['entry_count']/3)
  bounds=[round(sum(p[j]*p[2] for p in ratios)/sum(p[2] for p in ratios)*100*coverage,2) for j in (0,1)]
  base['value_range']=bounds;base['value_score']=bounds[0] if bounds[0]==bounds[1] else None
  base['value_notes'].append('数值权重 40% / 30% / 20% / 10%；不足3条按数量/3折减' if coverage<1 else '数值权重 40% / 30% / 20% / 10%，缺失词条不计权重')
 base['trait_notes']=[s for s in obs.get('issues',[]) if s.startswith('特性')]
 for key in ('1','2'):
  v=traits.get(key)
  if v and v not in anchor['traits'][key]:base['trait_notes'].append('特性'+key+'不在候选池（仅标注）')
  if not v and anchor['traits'][key] and obs.get('trait_presence',{}).get(key)!='absent':base['trait_notes'].append('特性'+key+'未确定（不影响评分）')
 for ch in model['characters']:
  if selected and ch['name'] not in selected:continue
  recs=[r for r in ch['recs'] if r['active'] and r['anchor']==anchor['name'] and r['slot']==anchor['slot']]
  if not recs:
   continue
  choices=[]
  for rec in recs:
   num=den=0;details=[]
   for e in rec['entries']:
    key=str(e['idx']);is_entry=e['kind']=='entry';obj=rows.get(key) if is_entry else traits.get(key)
    actual=obj['stat'] if is_entry and obj else obj if not is_entry else None
    legal=anchor['pools'][key] if is_entry else anchor['traits'][key]
    p,_=preference(e,actual,legal)
    important=any(t['bold'] or t['red'] for t in e['tokens']);red=any(t['red'] for t in e['tokens'])
    weight=0 if e['all_equal'] or not is_entry else (5 if red else 3 if important else 1)*(1 if len(legal)>1 else .25)
    # Numeric magnitudes, star tiers and min/max direction intentionally do not affect affinity.
    num+=weight*p;den+=weight
    details.append({'label':('词条' if is_entry else '特性')+key,'actual':actual or '无','recommend':e['raw'],
                    'weight':weight,'match':round(p*100,2),'source':e['source']})
   gate,checks=recommendation_gate(rec,anchor,rows,traits,evidence,ch['note'],policy['keep'])
   failed=[x['label']+'：'+x['reason']+('（档位未确定）' if x['pass'] is None else '（未通过）') for x in checks if x['pass'] is not True]
   choices.append({'character':ch['name'],'score':round(num/den*100,2) if den else 0,'rank':rec['rank'],
                   'details':details,'note':ch['note'],'gate_pass':gate,'gate_checks':checks,
                   'reason':'；'.join(failed) if failed else '重要词条、红字词条和 min 条件通过（特性仅供参考）'})
  all_choices.extend(choices)
  best=max(choices,key=lambda r:(r['score'],-r['rank']))
  # Keep the highest affinity visible, but preserve an eligible alternative recommendation.
  best=dict(best,alternatives=choices)
  base['matches'].append(best)
 base['matches'].sort(key=lambda x:-x['score'])
 if base['matches']:base['match_score']=base['matches'][0]['score']
 issues[:]=list(dict.fromkeys(issues))
 base['quality_filter']=quality_filter(obs,evidence,policy['discard'])
 base['eligible_matches']=[{'character':c['character'],'rank':c['rank'],'score':c['score']} for c in all_choices if c['gate_pass'] is True and c['score']>=policy['keep']['match_threshold']]
 base['decision'],reason=decide(base['quality_filter'],all_choices,policy,issues,base['value_range'])
 base['reasons']=issues+[reason]
 return base
