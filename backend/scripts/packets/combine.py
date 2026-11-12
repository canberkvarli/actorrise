import json, re, sys, glob, os
sys.path.insert(0,"/home/user/actorrise/backend/scripts"); sys.path.insert(0,"/home/user/actorrise/backend")
import scrape_contemporary_plays as scp
sys.path.insert(0,'pk')
import fixes
SRC={"nida25":("NIDA BFA Acting monologue list 2025","https://www.nida.edu.au/wp-content/uploads/Monologue-List_2025_final_v2.pdf"),
"_off_nida23":("NIDA BFA Acting monologue list 2023","https://www.nida.edu.au/wp-content/uploads/ACTING_Monologue-List_2023.pdf"),
"laine":("Laine Theatre Arts audition monologues 2025/26","https://www.laine-theatre-arts.co.uk/wp-content/uploads/2025/11/MONOLOGUES-26-ENTRY-.pdf"),
"dawson_f":("Dawson College contemporary monologues","https://www.dawsoncollege.qc.ca/professional-theatre/wp-content/uploads/sites/11/monologues_contemporary_female.pdf"),
"dawson_m":("Dawson College contemporary monologues","https://www.dawsoncollege.qc.ca/professional-theatre/wp-content/uploads/sites/11/monologues_contemporary_male.pdf"),
"sct":("Seattle Children's Theatre monologue packet 2019","https://www.sct.org/app/uploads/2018/10/Monologue-Packet-2019.pdf"),
"vca":("VCA Music Theatre monologues booklet","https://vadastudios.com/wp-content/uploads/2023/10/Contemporary-Monologues.pdf"),
"village":("Village Theatre audition monologues","https://villagetheatre.org/wp-content/uploads/2020/07/Audition_Monologues.pdf"),
"ca_f24":("Charter Arts audition monologues","https://www.charterarts.org/wp-content/uploads/2024/06/2024-2025-Female-Audition-Monologues.pdf"),
"ca_m24":("Charter Arts audition monologues","https://www.charterarts.org/wp-content/uploads/2024/06/2024-2025-Male-Audition-Monologues.pdf"),
"ca_f19":("Charter Arts audition monologues","https://www.charterarts.org/wp-content/uploads/2019/11/Female-Audition-Monologues-2019-2020.pdf"),
"ca_m20":("Charter Arts audition monologues","https://www.charterarts.org/wp-content/uploads/2019/11/Male-Audition-Monologues-2020-2021.pdf"),
"ca_m14":("Charter Arts audition monologues","https://www.charterarts.org/wp-content/uploads/2014/10/Revised-Male-Monologues.pdf"),
"ca_f13":("Charter Arts audition monologues","https://www.charterarts.org/wp-content/uploads/2011/10/Theatre-FemaleAudition13-14.pdf"),
"cab":("Cab Calloway School of the Arts monologue suggestions","https://www.cabcallowayschool.org/wp-content/uploads/2018/06/HS-THEATRE-ASSESMENT-MONOLOGUES.pdf"),
"newark":("Newark Arts High School monologue bank 2023","https://www.nps.k12.nj.us/ART/wp-content/uploads/sites/104/2022/11/2023-Arts-High-School-Drama-Audition-Monologue-Bank.pdf"),
"lhs_f":("Lakeside HS audition monologues","https://lhstheatredept.weebly.com/uploads/1/1/9/0/119047293/female_monologues.pdf"),
"weareactors":("We Are Actors","https://weareactors.com/monologues/"),
"take2":("Take 2 Actor's Studio","https://www.take2actorsstudio.com/monologues-for-class.html")}
def norm_title(t):
    t=t.replace("’","'").replace("‘","'").replace("“",'"').replace("”",'"').strip(" .,:;\"")
    t=re.sub(r"\s+"," ",t)
    t=scp._da_title(t)
    return fixes.TITLE.get(t,t)
def norm_author(a):
    a=re.sub(r"\s*\(.*$","",a).replace("’","'").strip(" .,")
    a=re.sub(r",?\s*adapted by.*$","",a,flags=re.I)
    a=a.title() if a.isupper() else a
    return fixes.AUTHOR.get(a,a)
DENY=re.compile(r"arnone|dorf|lindsay price|d\.? ?m\.? larson|meddaugh|arthur m\.? jolly|labedman",re.I)
def load():
    out=[]
    for k,(name,url) in SRC.items():
        f=f"pk/pdf/{k}.json" if k!="take2" else "man/take2.json"
        if not os.path.exists(f): continue
        d=json.load(open(f)); ps=d["pieces"] if isinstance(d,dict) else d
        for p in ps:
            t=norm_title(p["play_title"]); a=norm_author(p["author"])
            if len(t)>70 or not a or DENY.search(a) or not p.get("character") or not p.get("text"): continue
            paras=[x.strip() for x in p["text"].split("\n\n") if x.strip()]
            while len(paras)>1 and len(paras[-1].split())<=4 and not paras[-1].rstrip(')"”’').endswith((".","!","?","…")): paras.pop()
            p=dict(p); p["text"]=re.sub(r"\[([^\]\n]{1,160})\]",r"(\1)","\n\n".join(paras))
            g="musical" if t in fixes.MUSICAL else p.get("genre","drama")
            out.append({**p,"play_title":t,"author":a,"genre":g,"_src":k,"_srcname":name,"url":p.get("url") or url})
    return out
if __name__=="__main__":
    ps=load(); years=scp.load_years(); seen={}
    for p in ps: seen.setdefault((p["play_title"],p["author"]),0); seen[(p["play_title"],p["author"])]+=1
    print(len(ps),len(seen))
    for (t,a),n in sorted(seen.items()):
        if t.casefold() not in years: print(f"{t} | {a}")
