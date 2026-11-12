import re, json, glob, html, hashlib
urls=json.load(open("pk/wa_urls.json")); H={hashlib.md5(u.encode()).hexdigest():u for u in urls}
out=[]; kinds={}
for f in glob.glob("pk/wa/*.html"):
    h=open(f,encoding="utf-8",errors="replace").read(); u=H[f.split("/")[-1][:-5]]
    chips=[html.unescape(re.sub(r"<[^>]+>","",c)).strip() for c in re.findall(r"<li[^>]*>(.*?)</li>",(re.search(r'<ul class="waa-chips">(.*?)</ul>',h,re.S) or [None,""])[1],re.S)]
    lede=re.search(r'<p class="waa-lede">(.*?)</p>',h,re.S)
    m=re.search(r"monologue from the (play|film|musical|tv show|tv series|series|show|movie)\s+(.*?) by (.*?)\. ",html.unescape(re.sub(r"<[^>]+>","",lede.group(1))) if lede else "",re.I)
    who=re.search(r'<h1[^>]*>.*?<span>(.*?)</span>',h,re.S)
    lines=re.findall(r'<p class="waa-line">(.*?)</p>',h,re.S)
    paras=[re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>","",l))).strip() for l in lines]
    kind=(chips[0] if chips else "?"); kinds[kind]=kinds.get(kind,0)+1
    if not m or not who or not paras or kind not in ("Play","Musical"): continue
    out.append({"play_title":m.group(2).strip(),"author":m.group(3).strip(),"character":html.unescape(who.group(1)).strip(),"text":"\n\n".join(p for p in paras if p),"genre":"musical" if kind=="Musical" else "drama","url":u})
print(kinds,len(out)); json.dump(out,open("pk/pdf/weareactors.json","w"),ensure_ascii=False,indent=1)
