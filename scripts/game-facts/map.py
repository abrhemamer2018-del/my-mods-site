import os,re,json,glob
SITE=r"c:\www.ta3reebat.com التحكم ب\src\content\translations"
ARC=[r"D:\اعمال كلاود"]
def norm(s):
    s=re.sub(r"II","2",s); s=s.lower().replace('&','and')
    s=re.sub(r"[™®©'’:\-–—_.,!()\[\]]"," ",s)
    s=re.sub(r"\b(the|definitive|edition|remastered|enhanced|goty|game of the year)\b"," ",s)
    return re.sub(r"\s+","",s)
arcs={}
for d in ARC:
    for f in os.listdir(d):
        m=re.match(r"(.*?)\.(zip|rar)$",f,re.I)
        if not m: continue
        base=m.group(1); v=1
        mv=re.search(r"[\s_][vV](\d+)$",base)
        if mv: v=int(mv.group(1)); base=base[:mv.start()]
        k=norm(base)
        if not k: continue
        p=os.path.join(d,f)
        cur=arcs.get(k)
        if not cur or (v,os.path.getmtime(p))>(cur[0],cur[2]): arcs[k]=(v,p,os.path.getmtime(p),base)
out={};miss=[]
OVR={'the-elder-scrolls-v-skyrim-special-edition':r'D:\اعمال كلاود\Skyrim Special Edition v2.zip'}
for slug in sorted(os.listdir(SITE)):
    md=open(os.path.join(SITE,slug,'index.md'),encoding='utf-8').read()
    t=re.search(r"^title:\s*(.+)$",md,re.M).group(1).strip().strip('"\'')
    cands=[t]+re.findall(r"^\s*-\s*(.+)$",(re.search(r"^aliases:\n((?:\s*-.*\n)+)",md,re.M) or [None,""])[1] if re.search(r"^aliases:\n((?:\s*-.*\n)+)",md,re.M) else "",re.M)
    hit=None
    if slug in OVR: hit=(0,OVR[slug])
    for c in ([] if hit else cands)+[slug.replace('-',' ')]:
        k=norm(c)
        if k in arcs: hit=arcs[k];break
    if not hit:
        k=norm(t)
        for ak,a in arcs.items():
            if len(k)>4 and (ak.startswith(k) or k.startswith(ak)) and len(ak)>4: hit=a;break
    if hit: out[slug]={'title':t,'arc':hit[1],'v':hit[0]}
    else: miss.append((slug,t))
json.dump(out,open('map.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(out),'matched;',len(miss),'missing')
for m in miss: print(' ',m)
