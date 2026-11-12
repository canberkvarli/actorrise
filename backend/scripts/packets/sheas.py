import requests, re, time, os, subprocess, json
s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
h=s.get("https://www.sheas.org/monologue-library/",timeout=40).text
links=list(dict.fromkeys(re.findall(r'href="(https://media\.sheas\.org/[^"]+\.pdf)"',h))); print("sheas",len(links))
json.dump(links,open("pk/sheas/links.json","w"))
for i,u in enumerate(links):
    p=f"pk/sheas/{i:02d}.pdf"
    if os.path.exists(p): continue
    r=s.get(u,timeout=40)
    if r.status_code==200 and r.content[:4]==b"%PDF": open(p,"wb").write(r.content); subprocess.run(["pdftotext",p,p[:-4]+".txt"],stderr=subprocess.DEVNULL)
    time.sleep(1)
# NWHS drive docs
ids=[]
for f in ["f_1S7YXiaankPeYaqrIvLP-EidwXdC3TNO8.html","f_1mkoAjTVMHHJJeV5NroUFAl0tD0sDIK2X.html"]:
    ids+=re.findall(r'data-id="([\w\-]{25,})"',open(f,errors="replace").read())
ids=list(dict.fromkeys(ids)); print("nwhs ids",len(ids)); ok=0
for d in ids:
    p=f"pk/nw/{d}.txt"
    if os.path.exists(p): ok+=1; continue
    r=s.get(f"https://docs.google.com/document/d/{d}/export?format=txt",timeout=40)
    if r.status_code==200 and "<html" not in r.text[:200].lower(): open(p,"w").write(r.text); ok+=1
    time.sleep(1)
print("nwhs docs",ok)
