import requests, re, time, os, json
s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
def ids_in(t): return list(dict.fromkeys(re.findall(r"(?:document/d/|file/d/|open\?id=|\\x22|\"|/)(1[\w\-]{43}|1[\w\-]{32})(?=[\"\\/?&])",t)))
ids=[]
for fid in ["1S7YXiaankPeYaqrIvLP-EidwXdC3TNO8","1mkoAjTVMHHJJeV5NroUFAl0tD0sDIK2X"]:
    r=s.get(f"https://drive.google.com/embeddedfolderview?id={fid}#list",timeout=40)
    found=re.findall(r'id="entry-([\w\-]+)"',r.text) or ids_in(r.text)
    print("folder",fid[:8],r.status_code,len(found)); ids+=found
r=s.get("https://sites.google.com/cms.k12.nc.us/nwsaauditions-com/audition-at-nwsa/reference-documents/monologues",timeout=40)
nwsa=list(dict.fromkeys(re.findall(r"docs\.google\.com/document/d/([\w\-]{25,})",r.text)+re.findall(r"drive\.google\.com/file/d/([\w\-]{25,})",r.text)+re.findall(r"drive\.google\.com/open\?id=([\w\-]{25,})",r.text)))
print("nwsa",r.status_code,len(nwsa))
def grab(ids,d):
    ok=0
    for i in dict.fromkeys(ids):
        p=f"pk/{d}/{i}.txt"
        if os.path.exists(p): ok+=1; continue
        try:
            r=s.get(f"https://docs.google.com/document/d/{i}/export?format=txt",timeout=40)
            if r.status_code==200 and "<html" not in r.text[:300].lower() and len(r.text)>200: open(p,"w").write(r.text); ok+=1
        except Exception: pass
        time.sleep(1)
    return ok
print("nw docs",grab(ids,"nw")); print("nwsa docs",grab(nwsa,"nwsa"))
r=s.get("https://sites.google.com/view/springtownhstheatre/monologues",timeout=40); open("pk/springtown.html","w").write(r.text); print("springtown",r.status_code,len(r.text))
