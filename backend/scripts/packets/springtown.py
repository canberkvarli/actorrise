import re, json, sys
sys.path.insert(0,"pk"); import combine
L=open("pk/springtown.txt").read().split("\n")
heads=[]
for i,l in enumerate(L):
    m=re.match(r"^(?P<t>[A-Z][^,]{2,60}),\s*by:?\s+(?P<a>[A-Z][\w.’' \-]{3,40})$",l,re.I)
    if m: heads.append((i,i,m.group("t"),m.group("a"))); continue
    m=re.match(r"^(?:written\s+)?by:?\s+(?P<a>[A-Z][\w.’', \-]{3,45})$",l,re.I)
    if m and i>0 and len(L[i-1])<70 and not re.search(r"Music|Lyrics|Book|film",l): heads.append((i-1,i,L[i-1],m.group("a")))
CUE=re.compile(r"^(?:\d+\)\s*)?(?P<c>[A-Z][A-Z .’'\-]{1,24}):\s*(?P<rest>.*)$")
out=[]
for n,(s,e,t,a) in enumerate(heads):
    end=heads[n+1][0] if n+1<len(heads) else len(L)
    cur=None; pieces=[]
    for l in L[e+1:end]:
        m=CUE.match(l)
        if m: cur={"character":m.group("c").title(),"paras":[m.group("rest")] if m.group("rest") else []}; pieces.append(cur); continue
        if cur is not None: cur["paras"].append(l)
    for p in pieces:
        text="\n\n".join(x for x in p["paras"] if x)
        if len(text.split())>=90:
            out.append({"play_title":combine.norm_title(t),"author":combine.norm_author(a),"character":p["character"],"text":text,"url":"https://sites.google.com/view/springtownhstheatre/monologues"})
for p in out: print(p["play_title"],"|",p["author"],"|",p["character"],"|",len(p["text"].split()))
m=json.load(open("man/schools.json")); m["pieces"]+=[p for p in out if not combine.DENY.search(p["author"])]; json.dump(m,open("man/schools.json","w"),ensure_ascii=False,indent=1); print(len(out),len(m["pieces"]))
