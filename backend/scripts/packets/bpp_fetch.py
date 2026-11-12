import requests, json, time, hashlib, os
s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
urls=json.load(open("pk/bpp/urls.json")); os.makedirs("pk/bpp/pages",exist_ok=True); waits=0; got=0
for u in urls:
    p="pk/bpp/pages/"+hashlib.md5(u.encode()).hexdigest()+".html"
    if os.path.exists(p): continue
    for attempt in range(4):
        try:
            r=s.get(u,timeout=40)
        except Exception:
            time.sleep(60); continue
        if r.status_code==200 and "monologue-details" in r.text:
            open(p,"wb").write(r.content); got+=1; break
        waits+=1; print("wait page or",r.status_code,"- backing off",flush=True); time.sleep(120)
    time.sleep(8)
print("done: got",got,"wait pages",waits,flush=True)
