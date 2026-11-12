import requests, re, time, os, subprocess, json, html
s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
h=s.get("https://performing-arts.squarespace.com/monologues",timeout=40).text
links=[(html.unescape(re.sub(r"<[^>]+>","",t)).strip(),u) for u,t in re.findall(r'<a[^>]+href="(/s/[^"]+)"[^>]*>(.*?)</a>',h,re.S)]
links=list(dict.fromkeys(links)); print(len(links)); json.dump(links,open("pk/pai/links.json","w"))
ok=0
for i,(t,u) in enumerate(links):
    p=f"pk/pai/{i:02d}.pdf"
    if not u.lower().endswith(".pdf"): continue
    if not os.path.exists(p):
        try:
            r=s.get("https://performing-arts.squarespace.com"+u,timeout=60)
            if r.status_code==200 and r.content[:4]==b"%PDF": open(p,"wb").write(r.content)
            else: continue
        except Exception: continue
        time.sleep(1)
    subprocess.run(["pdftotext",p,p[:-4]+".txt"],stderr=subprocess.DEVNULL); ok+=1
print("ok",ok)
for i,(t,u) in enumerate(links): print(i,t)
