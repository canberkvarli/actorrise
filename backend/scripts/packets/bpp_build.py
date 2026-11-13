"""BPP pieces + play-page years -> manifest. Text stays in the scratchpad."""
import json,re,collections
P=json.load(open("pk/bpp/pieces.json")); Y=json.load(open("pk/bpp/years.json"))
DENY=["dorf","lindsay price","larson","meddaugh","jolly","arnone","lamedman","pizzarello"]
# A new English version of a classic is not what an actor means by contemporary.
CLASSIC=re.compile(r",\s*(?:freely\s+)?(?:translated|adapted(?!\s+from)|english version|a new version|in a new|newly)\b",re.I)
out=[];skip=collections.Counter()
for p in P:
    a=p["author"]
    if any(d in a.lower() for d in DENY): skip["deny"]+=1; continue
    if CLASSIC.search(a): skip["translation_of_classic"]+=1; continue
    if re.search(r"^plays by |\bother plays\b|\bshort plays\b|\bone acts\b|: later plays|latterday plays|^the liddy plays",p["play_title"],re.I): skip["collection_title"]+=1; continue
    y=Y.get(p["url"]) or {}
    ys=[v for v in (y.get("first"),y.get("pub")) if v]
    if not ys: skip["no_year"]+=1; continue
    meta={}
    if p.get("_gender"): meta["character_gender"]=p["_gender"]
    if p.get("_age") in ("Teen","Young Adult"): meta["character_age_range"]=p["_age"]
    g=p.get("_genre","").lower()
    out.append({"play_title":p["play_title"],"author":a,"character":p["character"],"text":p["text"],
                "url":p["url"],"year":min(ys),"genre":"comedy" if g=="comedy" else "drama","meta":meta})
json.dump({"source":"Broadway Play Publishing audition monologues","source_url":"https://www.broadwayplaypublishing.com/monologues/","pieces":out},open("man/bpp.json","w"),ensure_ascii=False)
print(len(out),dict(skip)); print(collections.Counter("pre80" if o["year"]<1980 else "ok" for o in out))
print(sorted({p["author"] for p in P if CLASSIC.search(p["author"])})[-40:])
