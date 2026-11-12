import json, re, html, collections, sys
sys.path.insert(0,"/home/user/actorrise/backend/scripts"); sys.path.insert(0,"/home/user/actorrise/backend"); sys.path.insert(0,"pk")
import scrape_contemporary_plays as scp, combine
def paras(body):
    out=[]
    for blk in re.split(r"</p>|</blockquote>|<br\s*/?>\s*<br\s*/?>",body):
        t=re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",blk))).strip()
        if t: out.append(t)
    return out
pieces=[]
for p in json.load(open("pk/tb/themonologuearchive.json")):
    if p.get("type")!="regular" or not p.get("regular-title"): continue
    ps=paras(p.get("regular-body",""))
    m=next((re.match(r"^From:\s*(.+?),\s*by\s+(.+)$",x) for x in ps if x.startswith("From:")),None)
    if not m: continue
    body=[x for x in ps if not re.match(r"^(From|Genre|Topic|Character|Note|Notes)\s*:",x)]
    char=p["regular-title"].split(" - ")[-1].strip()
    pieces.append({"play_title":m.group(1),"author":m.group(2),"character":char,"text":"\n\n".join(body),"url":p["url-with-slug"]})
for p in json.load(open("pk/tb/fuckyeahgreatmonologues.json")):
    t=p.get("regular-title") or ""
    if p.get("type")!="regular" or t.count("/")<2: continue
    parts=[x.strip() for x in re.split(r"/+",t) if x.strip()]
    if len(parts)<3: continue
    ps=paras(p.get("regular-body",""))
    body=[x for x in ps if not x.lower().startswith("this monologue has been") and not (x.startswith("“") and x.endswith("”") and len(x)>200)]
    pieces.append({"play_title":parts[0],"author":parts[2],"character":parts[1],"text":"\n\n".join(body),"url":p["url-with-slug"]})
for p in json.load(open("pk/tb/monologue-database.json")):
    t=p.get("regular-title") or ""; m=re.match(r"^(.+?) by (.+)$",t)
    ps=paras(p.get("regular-body",""))
    if not m or not ps: continue
    c=re.match(r"^(.+?)\s+-\s+(Female|Male)",ps[0])
    if not c: continue
    pieces.append({"play_title":m.group(1),"author":m.group(2),"character":c.group(1),"text":"\n\n".join(ps[1:]),"url":p["url-with-slug"]})
for p in pieces:
    p["play_title"]=combine.norm_title(p["play_title"]); p["author"]=combine.norm_author(p["author"]); p["character"]=p["character"].title() if p["character"].isupper() else p["character"]
json.dump(pieces,open("pk/pdf/tumblr.json","w"),ensure_ascii=False,indent=1)
years=scp.load_years(); c=collections.Counter((p["play_title"],p["author"]) for p in pieces)
print(len(pieces),len(c))
for (t,a),n in sorted(c.items()):
    if t.casefold() not in years: print(n,"|",t,"|",a)
