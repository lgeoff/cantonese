#!/usr/bin/env python3
"""Bundle unit JSON files into app/data/course.json and stamp the service-worker cache version."""
import json, glob, os, hashlib, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
units = []
for p in sorted(glob.glob(os.path.join(ROOT, 'data', 'units', 'u*.json'))):
    units.append(json.load(open(p, encoding='utf-8')))
order = json.load(open(os.path.join(ROOT, 'data', 'order.json'), encoding='utf-8'))
seq = [(uid, L['level']) for L in order['levels'] for uid in L['units']]
byid = {u['id']: u for u in units}
missing = [u for u in byid if u not in dict(seq)]
if missing: raise SystemExit(f'units missing from data/order.json: {missing}')
units = []
for uid, level in seq:
    if uid in byid:
        byid[uid]['level'] = level
        units.append(byid[uid])
out = json.dumps({'units': units}, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(ROOT, 'data', 'course.json'), 'w', encoding='utf-8').write(out)
h = hashlib.sha1()
for p in sorted(glob.glob(os.path.join(ROOT, '**', '*.*'), recursive=True)):
    if p.endswith('sw.js') or '/units/' in p: continue
    h.update(open(p, 'rb').read())
ver = h.hexdigest()[:10]
sw = os.path.join(ROOT, 'sw.js')
s = open(sw, encoding='utf-8').read()
s = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{ver}';", s)
open(sw, 'w', encoding='utf-8').write(s)
nw = sum(len(u['words']) for u in units)
ns = sum(len(u.get('sentences', [])) + len((u.get('dialogue') or {}).get('lines', [])) for u in units)
print(f'{len(units)} units, {nw} words, {ns} sentences/lines, cache {ver}, course.json {len(out)//1024} KB')
