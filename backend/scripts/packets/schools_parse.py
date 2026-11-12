import json, re, glob, sys
sys.path.insert(0,"pk"); sys.path.insert(0,"/home/user/actorrise/backend/scripts"); sys.path.insert(0,"/home/user/actorrise/backend")
import combine, scrape_contemporary_plays as scp
out=[]
def body_to_paras(lines):
    paras=[];cur=[]
    for l in lines:
        l=l.strip()
        if not l:
            if cur: paras.append(" ".join(cur)); cur=[]
        else: cur.append(l)
    if cur: paras.append(" ".join(cur))
    return paras
for d,url in (("nw","https://drive.google.com/drive/folders/1Qh5HjN4xGVDHQXh-oGJ-lIiN2IfkUOrx"),("nwsa","https://sites.google.com/cms.k12.nc.us/nwsaauditions-com/audition-at-nwsa/reference-documents/monologues")):
    for f in sorted(glob.glob(f"pk/{d}/*.txt")):
        L=[l.rstrip() for l in open(f,encoding="utf-8-sig",errors="replace").read().split("\n")]
        L2=[l for l in L if l.strip()]
        if len(L2)<2: continue
        m=re.match(r"^(.+?),?\s+by\s+(.+)$",L2[0].strip(),re.I)
        if m: title,author,rest=m.group(1),m.group(2),L[L.index(L2[0])+1:]
        elif re.match(r"^by\s+",L2[1].strip(),re.I): title,author,rest=L2[0].strip(),re.sub(r"^by\s+","",L2[1].strip(),flags=re.I),L[L.index(L2[1])+1:]
        else: print("skip",f,L2[:2]); continue
        rest=[l for l in rest]
        while rest and not rest[0].strip(): rest.pop(0)
        if not rest: continue
        c=None
        for k,l in enumerate(rest[:8]):
            l=l.strip()
            c=re.match(r"^([A-Z][A-Za-z .’'\-]{0,30}?)(?:\s*\([^)]*\))?:\s*(.*)$",l)
            if not c and l.isupper() and 1<len(l)<=30: c=re.match(r"^(.+)()$",l)
            if c: rest=rest[k:]; break
        if not c: print("nocue",f,rest[0][:50]); continue
        char=c.group(1); lines=[c.group(2)]+rest[1:]
        paras=[p.strip("“”\" ") for p in body_to_paras(lines)]
        text=re.sub(r"\[([^\]\n]{1,160})\]",r"(\1)","\n\n".join(p for p in paras if p))
        a=combine.norm_author(author); t=combine.norm_title(title)
        if combine.DENY.search(a): continue
        out.append({"play_title":t,"author":a,"character":char.title() if char.isupper() else char,"text":text,"url":f"https://docs.google.com/document/d/{f.split('/')[-1][:-4]}/"})
json.dump({"source":"school audition collections (shared Google Docs)","source_url":"","pieces":out},open("man/schools.json","w"),ensure_ascii=False,indent=1)
years=scp.load_years(); print(len(out))
for p in out:
    if p["play_title"].casefold() not in years: print(p["play_title"],"|",p["author"],"|",p["character"],"|",len(p["text"].split()))
