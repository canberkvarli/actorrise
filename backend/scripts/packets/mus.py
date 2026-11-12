import re, json, sys
links=json.load(open("pk/pai/links.json")); B="https://performing-arts.squarespace.com"
SHOWS={ # file -> (title, book writer, year, url)
"pk/pai/06.txt":("The Addams Family","Marshall Brickman and Rick Elice",2010,B+links[6][1]),
"pk/pai/78.txt":("Shrek the Musical","David Lindsay-Abaire",2008,B+links[78][1]),
"pk/pai/53.txt":("Matilda","Dennis Kelly",2010,B+links[53][1]),
"pk/pai/64.txt":("Oklahoma!","Oscar Hammerstein II",1943,B+links[64][1]),
"pk/pai/70.txt":("Rock of Ages","Chris D'Arienzo",2005,B+links[70][1]),
"pk/pai/31.txt":("Footloose","Dean Pitchford & Walter Bobbie",1998,B+links[31][1]),
"pk/pai/32.txt":("Freaky Friday","Bridget Carpenter",2016,B+links[32][1]),
"pk/pai/82.txt":("The Sound of Music","Howard Lindsay and Russel Crouse",1959,B+links[82][1]),
"pk/pai/83.txt":("The SpongeBob Musical","Kyle Jarrow",2016,B+links[83][1]),
"pk/pai/11.txt":("Anne of Green Gables: The Musical","Donald Harron",1965,B+links[11][1]),
"dl/177a397516/f.txt":("Chicago","Fred Ebb and Bob Fosse",1975,"https://docs.google.com/document/d/1hjvslbAuRKNm2aN1mRmhIkYkCprVby3ACQRtDoM3q7E/"),
"dl/19a86e4583/f.txt":("Rodgers + Hammerstein's Cinderella","Douglas Carter Beane",2013,"https://docs.google.com/document/d/1a6mjTLHAcb0jSmt3tVWMZK6Vsj9pH4Sw/"),
"dl/4eb1385f9e/f.txt":("The 25th Annual Putnam County Spelling Bee","Rachel Sheinkin",2005,"https://grafenwoehr.armymwr.com/download_file/view/4b8a4713-c0e7-4266-945a-afd5df16bc36/6121"),
"dl/acf5669632/f.txt":("The Prom","Bob Martin and Chad Beguelin",2018,"https://fhgov.com/media/ltwdqkza/start-here-prom-audition-material.pdf"),
"dl/5b911d0364/f.txt":("High School Musical","David Simpatico",2006,"https://docs.google.com/document/d/1BXPytGHHD20CMR_mgLS4q_nCYIEHkKX0/"),
"dl/1a19d3fa40/f.txt":("Annie","Thomas Meehan",1976,"https://mrjessemusic.yolasite.com/resources/Readings-Annie.pdf"),
}
import os
for k in ["03a1557a54","779ef9d9dd","bf390832c5","f04d525a55"]:
    t=open(f"dl/{k}/f.txt",errors="replace").read()
    if "Katherine" in t and "Medda" in t and "Pulitzer" in t and "Sides" not in t[:200]:
        SHOWS[f"dl/{k}/f.txt"]=("Newsies","Harvey Fierstein",2011,"https://docs.google.com/document/d/10o9718P6osjU7dR6MpggYBujAN5vUB2QXSS7HEfaqHw/"); break
CUE=re.compile(r"^(?P<c>[A-Z][A-Za-z .’'/&\-]{1,32}?)(?:\s*\([^)]{0,40}\))?\s*(?::|\s-\s)\s*(?P<rest>.*)$")
SOLO=re.compile(r"^(?P<c>[A-Z][A-Za-z .’'/&\-]{1,28})(?:\s*\([^)]{0,40}\))?:?$")
out=[]
for f,(title,author,year,url) in SHOWS.items():
    if not os.path.exists(f): print("missing",f); continue
    lines=[l.replace("\u200b","").strip() for l in open(f,errors="replace").read().replace("\x0c","\n").split("\n")]
    lines=[re.sub(r"^([A-Z][A-Za-z .]{1,24}?)-\[[^\]]*\]\.?\s*",r"\1: ",l) for l in lines]
    cur=None; n=0
    for l in lines:
        m=CUE.match(l); s=SOLO.match(l) if not m else None
        is_head = (m and len(m.group("c").split())<=4 and not m.group("c").lower().startswith(("note","scene","act ","read","side","audition","monologue","context","setting"))) or (s and len(s.group("c").split())<=3 and (l.endswith(":") or l.isupper()) and "monologue" not in l.lower() and "audition" not in l.lower())
        if is_head:
            cur={"play_title":title,"author":author,"character":(m or s).group("c").strip().title(),"paras":[[ (m.group("rest") if m else "") ]],"year":year,"genre":"musical","url":url}; out.append(cur); n+=1; continue
        if cur is None: continue
        if not l: cur["paras"].append([]); continue
        cur["paras"][-1].append(l)
    print(f, title, n)
pieces=[]
for p in out:
    paras=[" ".join(x for x in para if x).strip() for para in p.pop("paras")]; paras=[x for x in paras if x]
    p["text"]=re.sub(r"^(\((Kid|Small kid|Host|read this)[^)]*\)\s*)+","","\n\n".join(paras)).strip()
    p["text"]=re.sub(r"^Rock of Ages Youth Edition Monologues\s*","",p["text"])
    p["character"]=re.sub(r"\s+(Monologue|Monolog|Scene)$","",p["character"]).strip()
    if p["character"] in {"From The Authors","Frequently Asked Questions","Synopsis","Rehearsals","Chicago","Dance Auditions For Chicago","Mr. Lemberg"}: continue
    if len(p["text"].split())>=60: pieces.append(p)
json.dump({"source":"musical audition packets, 2026-11-12","source_url":"","pieces":pieces},open("man/musicals.json","w"),ensure_ascii=False,indent=1)
print(len(pieces), sum(len(p["text"].split())>=100 for p in pieces))
