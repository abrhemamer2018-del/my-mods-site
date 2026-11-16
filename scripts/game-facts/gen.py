import json,re
f=json.load(open('facts.json',encoding='utf-8'))
AR=re.compile('[\u0600-\u06FF]'); LAT=re.compile('[A-Za-z]')
DROP_LINES={'kingdom-come-deliverance-ii','rimworld','the-last-of-us-part-i'}
out={}
for s,x in sorted(f.items()):
    e={}
    n=x.get('lines')
    if n and n>=200 and s not in DROP_LINES: e['lines']=n
    g=x.get('glossary') or {}
    terms=[];seen_ar=set();seen_en=set();seen_ws=[]
    if isinstance(g,dict):
        for en,ar in g.items():
            if not isinstance(ar,str) or not isinstance(en,str): continue
            en=en.strip(); ar=ar.strip()
            if not AR.search(ar) or LAT.search(ar) or not LAT.search(en): continue
            if any(c in ar for c in '()[]/{}|=<>%') or any(c in en for c in '{}<>%|[]'): continue
            if len(ar)>28 or len(en)>32 or len(en)<4: continue
            if en.isupper() and len(en)<=4: continue
            k=en.lower().rstrip('s')
            if ar in seen_ar or k in seen_en: continue
            ws={w for w in re.findall(r"[a-z0-9']+",en.lower()) if w not in ('mr','mrs','ms','the','of','sir','dr')}
            if any(ws and ws<=t for t in seen_ws): continue
            seen_ws.append(set(re.findall(r"[a-z0-9']+",en.lower())))
            seen_ar.add(ar); seen_en.add(k); terms.append([en,ar])
            if len(terms)>=10: break
    if len(terms)>=4: e['terms']=terms
    if e: out[s]=e
json.dump(out,open(r"c:\www.ta3reebat.com التحكم ب\src\data\game-facts.json",'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(out),sum('lines' in v for v in out.values()),sum('terms' in v for v in out.values()))
for s in ['palworld','hades-ii','frostpunk','persona-5-royal','cuphead']: print(s,out.get(s))
