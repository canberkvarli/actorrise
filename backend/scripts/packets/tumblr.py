import requests, json, time, re, sys
s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
for blog in ["themonologuearchive","fuckyeahgreatmonologues","monologue-database","actingmonologues","maeves-monologue-archive"]:
    posts=[]; start=0
    while True:
        try:
            r=s.get(f"https://{blog}.tumblr.com/api/read/json",params={"start":start,"num":50},timeout=40)
        except Exception as e: print(blog,"ERR",str(e)[:60]); break
        if r.status_code!=200: print(blog,"status",r.status_code); break
        m=re.search(r"var tumblr_api_read = (.*);\s*$",r.text,re.S)
        if not m: print(blog,"no json"); break
        d=json.loads(m.group(1)); ps=d.get("posts",[]); posts+=ps
        total=int(d.get("posts-total",0)); start+=50
        if not ps or start>=total: break
        time.sleep(1)
    json.dump(posts,open(f"pk/tb/{blog}.json","w")); print(blog,len(posts))
