"""Split a packet's plain text into pieces. Heuristic; output is eyeballed."""
import re, json, sys
BY = re.compile(r"^(?:written\s+)?(?:by|adapted by|playwright:)\s+(?P<a>.+)$", re.I)
ONE = re.compile(r"^(?:from\s+|\d+\.\s*|play:\s*)?(?P<t>.+?),?\s+by\s+(?P<a>[A-Z][\w.’' \-]+?)(?:\s+(?:This|A|An|The|In|Set)\b.*)?$")
NAME = re.compile(r"^[A-Z][\w.’'\-]+(?:,? [\w.’'\-()&]+){0,7}$")
PAGE = re.compile(r"^(Page \| \d+|\d{1,3}|Page \d+( of \d+)?)$")
CUE_COLON = re.compile(r"^(?P<c>[A-Z][A-Za-z .’'\-]{0,28}?)(?::\s*(?P<rest>.*)|\.)$")
def is_caps(l): return l.isupper() and len(l)<=40 and not l.startswith("(")
def clean_title(t):
    t=re.sub(r"^(from\s+|\d+\.\s*|play:\s*|title:\s*)","",t.strip(),flags=re.I)
    t=re.sub(r"\s*\((young adventurers edition|excerpt)[^)]*\)","",t,flags=re.I)
    return t.strip(" ,​​")
def split(raw, one_line=False, char_first=False):
    lines=[l.replace("​","").strip() for l in raw.split("\n")]
    heads=[]
    for i,l in enumerate(lines):
        if one_line:
            m=ONE.match(l)
            if m and NAME.match(m.group("a").strip()) and (len(m.group("t"))<70 and not l.endswith((".","?","!")) or re.match(r"^\d+\.",l)):
                heads.append((i,i,clean_title(m.group("t")),m.group("a").strip(),""))
        else:
            m=BY.match(l)
            if m and i>0 and len(m.group("a"))<70:
                j=i-1
                while j>0 and not lines[j]: j-=1
                t=lines[j]; c=""
                if char_first and re.search(r"\s[–-]\s",t):
                    c,t=re.split(r"\s[–-]\s",t,maxsplit=1)
                if len(t)<80 and NAME.match(m.group("a").strip()) and t: heads.append((j,i,clean_title(t),m.group("a").strip(),c.strip()))
    out=[]
    for n,(s,e,t,a,c) in enumerate(heads):
        end=heads[n+1][0] if n+1<len(heads) else len(lines)
        body=[l for l in lines[e+1:end] if not PAGE.match(l)]
        # character
        char=c; start=0
        for k,l in enumerate(body[:40]):
            m=re.match(r"^character:\s*(.+)$",l,re.I)
            if m: char=m.group(1).strip(); start=k+1; continue
            if is_caps(l.rstrip(":.")) and len(l)>1 and not re.search(r"\d",l):
                char=char or l.rstrip(":."); start=k+1; break
            cm=CUE_COLON.match(l)
            if cm and (cm.group("c").isupper() or (len(cm.group("c").split())<=3 and (cm.group("rest") or "X")[:1].isupper() and not char)):
                if not re.match(r"^(note|setting|scene|time|context|synopsis|description|gender|age|genre|play|title)$",cm.group("c"),re.I):
                    char=char if (char and not cm.group("c").isupper()) else cm.group("c"); body[k]=cm.group("rest") or ""; start=k; break
        body=body[start:]
        # reflow: blank line = paragraph
        paras=[];cur=[]
        for l in body:
            if not l:
                if cur: paras.append(" ".join(cur)); cur=[]
            else: cur.append(l)
        if cur: paras.append(" ".join(cur))
        if paras and char:
            paras[0]=re.sub(r"^"+re.escape(char)+r"[:.]?\s+","",paras[0],flags=re.I)
            if paras[0].strip().lower()==char.lower(): paras=paras[1:]
        out.append({"play_title":t,"author":re.sub(r"\s+"," ",a).strip(" ."),"character":char.title() if char.isupper() else char,"text":"\n\n".join(paras)})
    return out
if __name__=="__main__":
    key=sys.argv[1]; flags=sys.argv[2:]
    ps=split(open(f"pk/pdf/{key}.raw",errors="replace").read(),one_line="one" in flags,char_first="cf" in flags)
    json.dump(ps,open(f"pk/pdf/{key}.json","w"),ensure_ascii=False,indent=1)
    for p in ps: print(f'{p["play_title"][:38]:38} | {p["author"][:26]:26} | {p["character"][:14]:14} | {len(p["text"].split()):4} | {p["text"][:50]!r}')
    print(len(ps))
