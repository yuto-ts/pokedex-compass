"""Import factual location table cells only; no invented encounter conditions.
Run explicitly when refreshing. HTML cache remains outside the project.
"""
import json,pathlib,re,html,time,urllib.request,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=pathlib.Path('/private/tmp/dex-source-cache');CACHE.mkdir(exist_ok=True)
POKES=json.loads((ROOT/'data/pokemon.json').read_text())
MAPPING={'Scarlet':'Scarlet','Violet':'Violet','Sword':'Sword','Shield':'Shield','Legends: Arceus':'Legends: Arceus','Legends: Z-A':'Legends Z-A','Legends: Z-A Mega Dimension':'Legends Z-A'}
def clean(s):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',s)).split())
def process(args):
 p,version=args
 slug={'nidoran-f':'nidoranf','nidoran-m':'nidoranm','mr-mime':'mr.mime','mime-jr':'mimejr.','type-null':'type:null','tapu-koko':'tapukoko','tapu-lele':'tapulele','tapu-bulu':'tapubulu','tapu-fini':'tapufini','mr-rime':'mr.rime','ho-oh':'ho-oh','porygon-z':'porygon-z'}.get(p['en'],p['en'].replace('-',''))
 url=f'https://www.serebii.net/pokedex-{version}/{slug}/'
 cache=CACHE/f'{version}-{p["id"]}.html'
 try:
  if cache.exists():s=cache.read_text()
  else:
   req=urllib.request.Request(url,headers={'User-Agent':'DexCompass Research/1.0'})
   with urllib.request.urlopen(req,timeout=25) as resp:s=resp.read().decode('latin1')
   cache.write_text(s)
  if 'Locations</h2>' not in s:return p['id'],[],url,'no-table'
  section=s.split('Locations</h2>',1)[1].split('</table>',1)[0]
  out=[];dlc='';remaining=0
  for row in re.findall(r'<tr[^>]*>(.*?)</tr>',section,re.S|re.I):
   cells=re.findall(r'<td([^>]*)>(.*?)</td>',row,re.S|re.I)
   block=None
   for attrs,content in cells:
    c=clean(content)
    if c in ['The Indigo Disk','The Teal Mask','Isle of Armor','Crown Tundra','The Crown Tundra']:
     block=c;m=re.search(r'rowspan="?(\d+)',attrs);remaining=int(m.group(1)) if m else 1;dlc=c
   gamecell=next((clean(c) for a,c in cells if clean(c) in MAPPING),None)
   if not gamecell:continue
   info=next((c for a,c in cells if 'fooinfo' in a),None)
   d=dlc if remaining else ''
   if remaining:remaining-=1
   if not info:continue
   txt=clean(info)
   if not txt or re.search(r'transfer|not (?:available|obtainable)|event|trade from|trade with|Pok.mon HOME|not found|unobtainable',txt,re.I):continue
   game=MAPPING[gamecell]
   if len(txt)>900:txt=txt[:900]+' …（出典に続く）'
   method='special';difficulty=3
   if re.search(r'^Evolve ',txt,re.I):method='evolution';difficulty=2
   elif re.search(r'^Gift ',txt,re.I):method='gift';difficulty=2
   elif re.search(r'^Breed ',txt,re.I):method='special';difficulty=2
   elif 'Dynamax Adventures' in txt or 'Hyperspace' in txt or 'Space-time' in txt:method='random';difficulty=4
   # Never infer fixed encounters from a location name alone.
   route=dict(game=game,method=method,text='出典の入手場所・条件：'+txt,difficulty=difficulty,fixed=False,trade=bool(re.search(r'\btrade\b',txt,re.I)),source=url,bank=False,imported=True)
   if d in ['The Indigo Disk','The Teal Mask']:route['dlc']=game+'：ゼロの秘宝'
   elif d=='Isle of Armor':route['dlc']=game+'：鎧の孤島'
   elif 'Crown Tundra' in d:route['dlc']=game+'：冠の雪原'
   elif 'Mega Dimension' in gamecell:route['dlc']='Z-A：M次元ラッシュ'
   if p['category']=='幻':route['status']='DLCで入手可能' if route.get('dlc') else '恒常入手可能'
   out.append(route)
  return p['id'],out,url,''
 except Exception as e:return p['id'],[],url,str(e)
jobs=[(p,'sv') for p in POKES]+[(p,'swsh') for p in POKES if p['id']<=905]
out={};errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for i,(pid,rs,url,err) in enumerate(pool.map(process,jobs)):
  if rs:out.setdefault(str(pid),[]).extend(rs)
  if err:errors.append({'url':url,'error':err})
  if (i+1)%100==0:print(i+1,'/',len(jobs),'processed;',len(out),'species',flush=True)
(ROOT/'data/modern-routes.json').write_text(json.dumps(out,ensure_ascii=False))
(ROOT/'data/import-report.json').write_text(json.dumps({'checked':'2026-09-08','pages':len(jobs),'speciesWithRoutes':len(out),'errors':errors},ensure_ascii=False,indent=2))
print('DONE',len(out),'species;',len(errors),'unavailable pages')
