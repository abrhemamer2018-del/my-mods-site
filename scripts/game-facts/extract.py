import json,os,re,zipfile,subprocess,sys
from multiprocessing import Pool
UNRAR=r"C:\Program Files\WinRAR\UnRAR.exe"
LINEFILES=('texts/strings_ar.json','work/verify/strings_ar.json','texts/ar_full.json','texts/rdr_texts_ar.json','texts/sm2_arabic.json','data/manual_ar.json','menu_ar.json','texts/overrides_ar.json')
WANT=LINEFILES+('texts/glossary.json','tarib_review.json','LESSONS.md')
def names(arc):
    if arc.lower().endswith('.zip'):
        return zipfile.ZipFile(arc).namelist()
    r=subprocess.run([UNRAR,'lb',arc],capture_output=True)
    return [x.replace(chr(92),'/') for x in r.stdout.decode('utf-8','replace').splitlines()]
def read(arc,n):
    if arc.lower().endswith('.zip'):
        return zipfile.ZipFile(arc).read(n)
    r=subprocess.run([UNRAR,'p','-inul',arc,n.replace('/',chr(92))],capture_output=True)
    if r.stdout: return r.stdout
    r=subprocess.run([UNRAR,'p','-inul',arc,'*'+chr(92)+n.split('/',1)[1].replace('/',chr(92))],capture_output=True)
    return r.stdout
def pick(ns,w):
    c=[n for n in ns if n.endswith(w) or n.endswith(w.split('/')[-1]) and w.startswith('texts') is False]
    c=[n for n in ns if n.lower().endswith('/'+w.lower()) or n.lower()==w.lower()]
    c.sort(key=lambda n:n.count('/'))
    return c[0] if c else None
AR=re.compile('[؀-ۿ]')
def strs(o):
    if isinstance(o,str): yield o
    elif isinstance(o,dict):
        for v in o.values(): yield from strs(v)
    elif isinstance(o,list):
        for v in o: yield from strs(v)
def count(obj):
    if isinstance(obj,dict):
        return sum(1 for v in obj.values() if any(AR.search(x) for x in strs(v)))
    if isinstance(obj,list):
        return sum(1 for v in obj if any(AR.search(x) for x in strs(v)))
    return 0
def job(item):
    slug,info=item; arc=info['arc']; r={'slug':slug,'arc':arc}
    try:
        ns=names(arc)
        for w in WANT:
            n=pick(ns,w)
            if not n: continue
            b=read(arc,n)
            if w.endswith('.json'):
                try: o=json.loads(b.decode('utf-8-sig'))
                except Exception as e: r[w+'_err']=str(e)[:80]; continue
                if w in LINEFILES:
                    if 'lines' not in r: r['lines']=count(o); r['linesrc']=w
                elif w=='texts/glossary.json': r['glossary']=o if isinstance(o,(dict,list)) else None
                else: r['review']={k:o.get(k) for k in ('game','characters') if isinstance(o,dict)}
            else: r['lessons']=b.decode('utf-8','replace')[:3000]
    except Exception as e: r['err']=str(e)[:200]
    return r
if __name__=='__main__':
    m=json.load(open('map.json',encoding='utf-8'))
    with Pool(24) as p: res=p.map(job,list(m.items()))
    json.dump({x['slug']:x for x in res},open('facts.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(sum('lines' in x for x in res),'with lines;',sum('glossary' in x for x in res),'with glossary;',sum('err' in x for x in res),'errors')
    for x in res:
        if 'lines' not in x: print(' no lines:',x['slug'],x.get('err',''))
