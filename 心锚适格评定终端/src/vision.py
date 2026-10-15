from PIL import Image,ImageChops,ImageStat
import hashlib

CENTERS=[633,755,877,999,1121]
def image(path):
 with Image.open(path) as im:
  if abs(im.width/im.height-16/9)>.02:raise ValueError('游戏画面必须为16:9；请使用1280×720或等比例窗口')
  return im.convert('RGB').resize((1280,720),Image.Resampling.LANCZOS)
def pixels(im,box):return list(im.crop(box).getdata())
def gold(p):r,g,b=p;return r>145 and g>105 and b<g*.9 and r>g*1.08
def white(p):r,g,b=p;return min(r,g,b)>120 and max(r,g,b)-min(r,g,b)<80

def rarity(im):
 # Large rarity stars beneath the item, distinct from the four numeric-tier stars.
 # Return unknown for clipped, faint or irregular shapes; unknown never skips OCR.
 x0,x1,y0,y1=120,242,326,360
 counts=[sum(gold(p) for p in pixels(im,(x,y0,x+1,y1))) for x in range(x0,x1)]
 groups=[]
 for x,n in enumerate(counts):
  if n>=4:
   if groups and x==groups[-1][-1]+1:groups[-1].append(x)
   else:groups.append([x])
 strong=[g for g in groups if len(g)>=7]
 if len(strong) not in (1,2,3):return None
 if any(not 7<=len(g)<=25 or sum(counts[x] for x in g)<70 for g in strong):return None
 centers=[(g[0]+g[-1])/2+x0 for g in strong]
 if len(strong)==1 and not 168<=centers[0]<=190:return None
 if any(not 29<=b-a<=43 for a,b in zip(centers,centers[1:])):return None
 if not 155<=sum(centers)/len(centers)<=205:return None
 covered={x for g in strong for x in g}
 if sum(n for x,n in enumerate(counts) if x not in covered)>28:return None
 return len(strong)

def level_order(im):
 # Gold active triangle at the level header: broad base at bottom means low first.
 counts=[sum(gold(p) for p in pixels(im,(686,y,708,y+1))) for y in range(42,62)]
 active=[i for i,n in enumerate(counts) if n>=2]
 if len(active)<7:return 'unknown'
 mid=(active[0]+active[-1])//2
 top=sum(counts[active[0]:mid+1]);bottom=sum(counts[mid+1:active[-1]+1])
 if top>bottom*1.6:return 'high_first'
 if bottom>top*1.6:return 'low_first'
 return 'unknown'
def star(im,pos):
 y=[182,225,267,310][pos-1];n=sum(gold(p) for p in pixels(im,(300,y-8,322,y+9)))
 return True if n>=35 else False if n<=3 else None
def empty_row(im,pos):
 # Both OCR passes must also be empty. This test only corroborates absence.
 y=[182,225,267,310][pos-1]
 return sum(white(p) or gold(p) for p in pixels(im,(345,y-7,520,y+8)))<8
def blank_trait(im,pos):
 y=410 if pos==1 else 466
 return sum(white(p) or gold(p) for p in pixels(im,(100,y-9,510,y+10)))<8
def mark_state(im,kind):
 box=(57,131,88,158) if kind=='lock' else (37,189,67,216)
 ps=pixels(im,box);g=sum(gold(p) for p in ps);red=sum(r>145 and r>1.6*g and r>1.6*b for r,g,b in ps)
 if g>110 or (kind=='discard' and red>90):return 'on'
 if g<12 and red<12 and sum(white(p) for p in ps)>35:return 'off'
 return 'unknown'
def card_bar(p):
 r,g,b=p
 return (b>90 and b>r*1.2 and b>g*1.05) or (g>85 and g>r*1.2 and g>b*1.02) or (min(p)>105 and max(p)-min(p)<22)

def grid_cells(im,partial=False):
 groups=[]
 for y in range(105,645):
  bars=[sum(card_bar(p) for p in pixels(im,(x-40,y,x+40,y+1))) for x in CENTERS]
  if max(bars)>65:
   if groups and y<=groups[-1][-1]+2:groups[-1].append(y)
   else:groups.append([y])
 cells=[]
 for group in groups:
  bottom=group[-1];cy=bottom-55
  if (bottom<195 and not partial) or cy>600:continue
  row=[]
  for col,x in enumerate(CENTERS):
   n=sum(card_bar(p) for p in pixels(im,(x-40,bottom-5,x+40,bottom+1)))
   if n>70:
    # Bottom bars fade into the card above and end at a dark gap below.
    # A selected card's bright top frame must not become an extra row.
    above=sum(ImageStat.Stat(im.crop((x-40,bottom-12,x+40,bottom-6))).mean)
    below=sum(ImageStat.Stat(im.crop((x-40,bottom+4,x+40,bottom+10))).mean)
    blue=sum(b>90 and b>r*1.2 and b>g*1.05 for r,g,b in pixels(im,(x-40,bottom-5,x+40,bottom+1)))
    if blue>70 or above>below+18:row.append({'col':col,'y':cy,'bottom':bottom})
  # White selected borders can conceal the rarity bar at the viewport edge.
  # Infer that one card only from a detected row plus both selected side edges.
  if row:
   occupied={c['col'] for c in row}
   for col in range(5):
    if col not in occupied and selected_cell(im,col,cy):row.append({'col':col,'y':cy,'bottom':bottom})
  cells.extend(sorted(row,key=lambda c:c['col']))
 return cells
def selected_cell(im,col,y):
 x=CENTERS[col]
 # Selected cards have bright vertical frame edges; ordinary blue card bars do not.
 def edge(cx):
  return max(sum((min(p)>65 and max(p)-min(p)<110) or gold(p) for p in pixels(im,(xx,max(90,y-42),xx+1,min(645,y+39)))) for xx in range(cx-5,cx+6))
 length=min(645,y+39)-max(90,y-42)
 threshold=min(65,length*.8)
 return length>=25 and edge(x-54)>threshold and edge(x+54)>threshold
def detail_same(a,b):
 # Ignore animated 3D art and mark buttons. Includes name, level, four rows and traits.
 boxes=[(345,63,535,101),(370,110,435,145),(335,166,528,330),(98,390,515,485)]
 return all(sum(ImageStat.Stat(ImageChops.difference(a.crop(box),b.crop(box))).mean)/3<3.5 for box in boxes)
def row_signatures(im,cells):
 rows=[]
 for y in sorted({c['y'] for c in cells}):
  row=[]
  for x in CENTERS:
   patch=im.crop((x-32,y-30,x+32,y+33)).resize((12,12)).convert('L')
   row.append(list(patch.getdata()))
  rows.append(row)
 return rows
def rows_equal(a,b):return sum(abs(x-y) for ca,cb in zip(a,b) for x,y in zip(ca,cb))/(5*144)<4
def overlap(old,new):
 if len(old)==len(new) and all(rows_equal(a,b) for a,b in zip(old,new)):return -1
 candidates=[n for n in range(1,min(len(old),len(new))+1) if all(rows_equal(a,b) for a,b in zip(old[-n:],new[:n]))]
 return candidates[0] if len(candidates)==1 else None

def same_row_positions(a,b):
 ay=sorted({c['y'] for c in a});by=sorted({c['y'] for c in b})
 return len(ay)==len(by) and all(abs(x-y)<=2 for x,y in zip(ay,by))

def selected_overlap(oldim,newim,oldcells,newcells):
 # The selected last card persists through a drag, including when partly clipped.
 # Use its frame as a physical row marker; identical item artwork is not an identity.
 if not oldcells or not newcells:return None
 if not detail_same(oldim,newim):return None
 last=oldcells[-1]
 if not selected_cell(oldim,last['col'],last['y']):return None
 candidates=[c for c in grid_cells(newim,partial=True) if c['col']==last['col'] and selected_cell(newim,c['col'],c['y'])]
 if len(candidates)!=1:return None
 shift=last['y']-candidates[0]['y']
 if not 5<shift<=420:return None
 oldys=sorted({c['y'] for c in oldcells});newys=sorted({c['y'] for c in newcells})
 n=0
 for y in newys:
  if y+shift>last['y']+3:break
  matches=[i for i,oy in enumerate(oldys) if abs(oy-(y+shift))<=3]
  # The unique selected frame + unchanged detail is the identity witness.
  # Card art/shadows animate and need not be pixel-identical on another GPU.
  if len(matches)!=1:return None
  n+=1
 # The first new row must immediately follow the last processed card, no hidden gap.
 if n<len(newys) and abs(newys[n]+shift-last['y']-130)>4:return None
 return n
