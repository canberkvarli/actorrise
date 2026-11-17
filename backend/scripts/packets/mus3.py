"""Musical audition packets, 2026-11-17: Legally Blonde (Great Theatre) and Little Shop of
Horrors (Hi-Desert Playhouse). Writes a manifest for scripts/ingest_monologue_manifest.py.
Both packets are read by line number: each speech sits under a role or side heading."""
import json
import re
import sys

D, OUT = sys.argv[1], sys.argv[2]

LB_URL = "https://www.greattheatre.org/app/uploads/Legally-Blonde-Monologues.pdf"
LS_URL = "http://hidesertculturalcenter.org/wp-content/uploads/2017/08/Little-Shop-Of-Horrors-Audition-Sides.pdf"

# (character, first line, last line), 1-based and inclusive. The Delta Nus' lines are for
# a group, and Kyle's is three sentences; both are left out.
LB = [("Elle Woods", 24, 28), ("Vivienne", 30, 33), ("Paulette", 35, 37), ("Brooke", 39, 43),
      ("Warner", 46, 49), ("Callahan", 51, 55), ("Emmett", 57, 63)]
# Monologue sides only; sides 4 and 6 are scenes. Page footers are dropped below.
LS = [("Seymour", 8, 14), ("Seymour", 16, 24), ("Audrey", 30, 37), ("Mr. Mushnik", 55, 62),
      ("Orin Scrivello", 80, 88)]

# Hi-Desert's PDF set some letter pairs as one glyph that extracts as a stray capital or
# digit: "li2le" (tt), "leD", "ADer" (ft), "paWo", "Wme" (ti).
WORDS = {"Wme": "time", "Wcket": "ticket", "Wll": "till", "leD": "left", "ADer": "After",
         "aDernoon": "afternoon"}


def mend(text: str) -> str:
    for bad, good in WORDS.items():
        text = re.sub(rf"\b{bad}\b", good, text)
    text = re.sub(r"(?<=[A-Za-z])2(?=[a-z])", "tt", text)
    text = re.sub(r"(?<=[a-z])W(?=[a-z])", "ti", text)
    text = re.sub(r"(?<=[a-z])D(?=[a-z])", "ft", text)
    return text


def speech(lines, a, b, *, speaker=None):
    body = [l for l in lines[a - 1:b] if not l.startswith("HI-DESERT CULTURAL CENTER")]
    text = " ".join(" ".join(body).split())
    if speaker:
        text = re.sub(rf"^{re.escape(speaker)}:\s*", "", text)
    text = text.replace("(gasp!)Whatis", "(gasp!) What is").replace("(pause)Make", "(pause) Make")
    text = text.replace("brunette?!What", "brunette?! What").replace("(Agan nothing.)", "(Again nothing.)")
    return text.rstrip("”\"").strip()


out = []
lb = open(f"{D}/gt_lb.txt").read().split("\n")
for character, a, b in LB:
    out.append({"play_title": "Legally Blonde", "author": "Heather Hach", "character": character,
                "text": speech(lb, a, b), "year": 2007, "genre": "musical", "url": LB_URL})

ls = open(f"{D}/hidesert.txt").read().split("\n")
for character, a, b in LS:
    speaker = {"Mr. Mushnik": "Mushnik", "Orin Scrivello": "Orin"}.get(character, character)
    out.append({"play_title": "Little Shop of Horrors", "author": "Howard Ashman",
                "character": character, "text": mend(speech(ls, a, b, speaker=speaker)),
                "year": 1982, "genre": "musical", "url": LS_URL})

json.dump({"source": "musical audition packets, 2026-11-17", "source_url": "", "pieces": out},
          open(OUT, "w"), ensure_ascii=False, indent=1)
for p in out:
    print(len(p["text"].split()), p["play_title"], "/", p["character"], "|", p["text"][:200])
