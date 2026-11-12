import requests, json, time, hashlib, os
s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
urls=json.load(open("pk/wa_urls.json")); os.makedirs("pk/wa",exist_ok=True); bad=0
for u in urls:
    p="pk/wa/"+hashlib.md5(u.encode()).hexdigest()+".html"
    if os.path.exists(p): continue
    try:
        r=s.get(u,timeout=30)
        if r.status_code==200: open(p,"wb").write(r.content)
        else: bad+=1
    except Exception: bad+=1
    time.sleep(1)
print("done, failures:",bad,"of",len(urls))
