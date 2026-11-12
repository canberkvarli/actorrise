import re, json, subprocess, sys
sys.path.insert(0,"pk"); sys.path.insert(0,"/home/user/actorrise/backend/scripts"); sys.path.insert(0,"/home/user/actorrise/backend")
import combine, scrape_contemporary_plays as scp
import glob
pages=[open(f,errors="replace").read() for f in sorted(glob.glob("pk/morgue/ocr/*.txt"))]; print(len(pages))
def doubled(t):
    w=t.split()
    if len(w)<30: return False
    return sum(1 for a,b in zip(w,w[1:]) if a==b)/len(w) > 0.12
BY=re.compile(r"^(?:written\s+)?by:?\s+(?P<a>[A-Z][\w.’' ,&\-]{3,60})$",re.I)
pieces=[]; cur=None; stats={"doubled":0,"nohead":0}
for n,pg in enumerate(pages,1):
    L=[l.strip() for l in pg.split("\n")]
    nz=[i for i,l in enumerate(L) if l]
    head=None
    for k in nz[:5]:
        m=BY.match(L[k])
        if m and k>0:
            j=k-1
            while j>0 and not L[j]: j-=1
            if L[j] and len(L[j])<80: head=(j,k,L[j],m.group("a")); break
        m2=re.match(r"^(?:from\s+)?(?P<t>.{3,70}?),?\s+by\s+(?P<a>[A-Z][\w.’' ,&\-]{3,50})$",L[k])
        if m2 and not L[k].endswith("."): head=(k,k,m2.group("t"),m2.group("a")); break
    if not head:
        if cur is not None and nz: cur["lines"]+=[""]+L   # continuation page
        else: stats["nohead"]+=1
        continue
    j,k,t,a=head; body=L[k+1:]; char=""
    for i,l in enumerate(body[:8]):
        m=re.match(r"^character:?\s*(.+)$",l,re.I)
        if m: char=m.group(1).strip(); body=body[i+1:]; break
    cur={"play_title":t,"author":a,"character":char,"lines":body,"page":n}; pieces.append(cur)
out=[]
for p in pieces:
    L=p.pop("lines")
    while L and not L[0]: L.pop(0)
    if not L: continue
    c=re.match(r"^([A-Z][A-Z .’'\-]{1,28})[.:]\s*(.*)$",L[0])
    if c:
        if not p["character"]: p["character"]=c.group(1).title()
        L[0]=c.group(2)
    if not p["character"]: continue
    paras=[];b=[]
    for l in L:
        if re.fullmatch(r"\d{1,3}",l): continue
        if not l:
            if b: paras.append(" ".join(b)); b=[]
        else: b.append(l)
    if b: paras.append(" ".join(b))
    # OCR leaves a blank line inside sentences: join a paragraph that does not end a sentence with the next
    j=[]
    for x in paras:
        if j and not re.search(r"[.!?…\"”)’'—-]$",j[-1]): j[-1]+=" "+x
        else: j.append(x)
    text="\n\n".join(j); text=re.sub(r"\s+([,.!?;:])",r"\1",text).replace(" '","'").replace("' s","'s")
    a=combine.norm_author(p["author"]); t=combine.norm_title(p["play_title"])
    if combine.DENY.search(a): continue
    out.append({"play_title":t,"author":a,"character":p["character"].title() if p["character"].isupper() else p["character"],"text":text,"url":"https://lhstheatredept.weebly.com/monologue-suggestions.html","_page":p["page"]})
json.dump(out,open("pk/morgue/pieces.json","w"),ensure_ascii=False,indent=1)
years=scp.load_years(); print(stats,len(out))
import collections; c=collections.Counter()
for p in out:
    if p["play_title"].casefold() not in years: c[(p["play_title"],p["author"])]+=1
for (t,a),n in sorted(c.items()): print(n,"|",t,"|",a)
