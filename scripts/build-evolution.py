import csv,json,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
def rows(name):return list(csv.DictReader(open('/private/tmp/dex-'+name+'.csv')))
def names(name,key):return {r[key]:r['name'] for r in rows(name) if r['local_language_id']=='1'}
items=names('item_names','item_id');moves=names('move_names','move_id');locs=names('location_names','location_id');vgs={r['id']:r['identifier'] for r in rows('version_groups')};ps={str(p['id']):p['name'] for p in json.loads((root/'data/pokemon.json').read_text())}
trigger={'1':'レベルアップ','2':'通信交換','3':'道具を使う','4':'特殊進化','5':'スピン','6':'追加ダメージ条件','7':'特定エリア','8':'特殊進化','9':'特殊進化','10':'特殊進化'}
out={}
for r in rows('evolution'):
 if r['evolved_species_id'] not in ps:continue
 text=[trigger.get(r['evolution_trigger_id'],'特殊進化')]
 if r['minimum_level']:text.append('Lv.'+r['minimum_level']+'以上')
 for key,label,dct in [('trigger_item_id','道具',items),('held_item_id','持ち物',items),('known_move_id','覚える技',moves),('used_move_id','使う技',moves),('location_id','場所',locs),('party_species_id','手持ち',ps),('trade_species_id','交換相手',ps)]:
  if r.get(key):text.append(label+'：'+dct.get(r[key],'ID '+r[key]))
 if r['gender_id']:text.append('♀' if r['gender_id']=='1' else '♂')
 if r['time_of_day']:text.append({'day':'昼','night':'夜','dusk':'夕方'}.get(r['time_of_day'],r['time_of_day']))
 for key,label in [('minimum_happiness','なつき度'),('minimum_beauty','うつくしさ'),('minimum_affection','なかよし度'),('minimum_move_count','技使用回数'),('minimum_steps','歩数'),('minimum_damage_taken','被ダメージ')]:
  if r.get(key):text.append(label+' '+r[key]+'以上')
 for key,label in [('needs_overworld_rain','雨のフィールド'),('turn_upside_down','本体を逆さにする'),('needs_multiplayer','マルチプレイ'),('near_special_rock','特定の岩の近く')]:
  if r.get(key)=='1':text.append(label)
 if r['relative_physical_stats']:text.append({'-1':'攻撃＜防御','0':'攻撃＝防御','1':'攻撃＞防御'}.get(r['relative_physical_stats'],''))
 if r.get('base_form_id') or r.get('evolved_form_id'):text.append('フォルム指定あり：出典参照')
 entry={'gameGroup':vgs.get(r['version_group_id'],'作品指定なし'),'text':' ／ '.join(text)}
 if entry not in out.setdefault(r['evolved_species_id'],[]):out[r['evolved_species_id']].append(entry)
(root/'data/evolution.json').write_text(json.dumps(out,ensure_ascii=False))
print('Evolution conditions:',len(out))
