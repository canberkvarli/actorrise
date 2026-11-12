import re, json, glob, html, hashlib, os, time, sys, requests
urls=json.load(open("pk/bpp/urls.json")); H={hashlib.md5(u.encode()).hexdigest():u for u in urls}
def clean(x): return re.sub(r"[ \t\xa0]+"," ",html.unescape(re.sub(r"<[^>]+>","",x))).strip()
pieces=[]; bad={}
for f in glob.glob("pk/bpp/pages/*.html"):
    h=open(f,encoding="utf-8",errors="replace").read(); u=H[f.split("/")[-1][:-5]]
    d=re.search(r'<div class="monologue-details">(.*?)<div class="post-monologue|<div class="monologue-details">(.*)$',h,re.S)
    blk=h[h.find('<div class="monologue-details">'):]
    hs=re.findall(r"<h2[^>]*>(.*?)</h2>",blk[:3000],re.S)
    if len(hs)<2: bad["nohead"]=bad.get("nohead",0)+1; continue
    tc=clean(hs[0]); author=clean(hs[1])
    if " — " not in tc: bad["nodash"]=bad.get("nodash",0)+1; continue
    title,char=tc.rsplit(" — ",1)
    meta=dict((k.lower(),clean(v)) for k,v in re.findall(r"<span style='font-weight: bold;[^']*'>(\w+):</span>([^<]*)",blk[:4000]))
    play=re.search(r"href='(https://www\.broadwayplaypublishing\.com/the-plays/[^']+)'",h)
    # text: the <div> after the second rule
    parts=blk.split('border-top: 1px solid #CCCCCC')
    if len(parts)<3: bad["nobody"]=bad.get("nobody",0)+1; continue
    body=parts[2]; body=body[body.find("</div>")+6:]
    end=re.search(r'<div style="border-top|<div class="(?:share|post-|related)|</div>\s*</div>\s*</div>',body)
    body=body[:end.start()] if end else body[:8000]
    paras=[clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>",body,re.S)]
    paras=[p for p in paras if p]
    if not paras: bad["nopara"]=bad.get("nopara",0)+1; continue
    paras[0]=re.sub(r"^"+re.escape(char)+r"\s*:\s*","",paras[0],flags=re.I)
    pieces.append({"play_title":title.strip(),"author":author,"character":char.strip(),"text":"\n\n".join(paras),
                   "url":play.group(1) if play else u,"_page":u,"_age":meta.get("age",""),"_genre":meta.get("genre","")})
print(len(pieces),bad)
json.dump(pieces,open("pk/bpp/pieces.json","w"),ensure_ascii=False)
if "--years" in sys.argv:
    s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
    yf="pk/bpp/years.json"; Y=json.load(open(yf)) if os.path.exists(yf) else {}
    for pu in sorted({p["url"] for p in pieces if "/the-plays/" in p["url"]}):
        if pu in Y: continue
        try:
            t=s.get(pu,timeout=30).text
        except Exception: continue
        t=re.sub(r"\s+"," ",html.unescape(re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>"," ",t,flags=re.S)))
        fp=re.search(r"(?:first produced|first presented|premiered|world premiere|originally produced|first performed|was produced)[^.]{0,220}?\b(19[2-9]\d|20[0-2]\d)\b",t,re.I)
        pd=re.search(r"Publication Date \d{1,2}/\d{1,2}/(\d{4})",t)
        Y[pu]={"first":int(fp.group(1)) if fp else None,"pub":int(pd.group(1)) if pd else None}
        json.dump(Y,open(yf,"w")); time.sleep(1)
    print("plays",len(Y),"with first-produced",sum(1 for v in Y.values() if v["first"]),"with pub only",sum(1 for v in Y.values() if not v["first"] and v["pub"]),"none",sum(1 for v in Y.values() if not v["first"] and not v["pub"]))
