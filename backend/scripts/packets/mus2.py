"""Musical audition packets, 2026-11-16: Guys and Dolls (Great Theatre), Little Women
(IP Theater), Mamma Mia! (Harlingen CISD). Writes man_mus2.json for
scripts/ingest_monologue_manifest.py."""
import json, re, sys

D = sys.argv[1]
OUT = sys.argv[2]

SHOWS = {
    "gd": ("Guys and Dolls", "Jo Swerling and Abe Burrows", 1950,
           "https://www.greattheatre.org/app/uploads/Guys-and-Dolls-Audition-Pieces.pdf"),
}
LW_URL = "http://iptheater.com/wp/wp-content/uploads/2017/04/Audition-Monologues-Little-Women.pdf"
# Little Women's packet puts the director's role breakdown (and audition song) on the
# lines above each speech, so the speeches are taken by line number (1-based, inclusive).
LW = [("Jo March", 8, 12), ("Jo March", 14, 19), ("Marmee", 21, 24), ("Amy March", 26, 29),
      ("Beth March", 31, 34), ("Meg March", 37, 40), ("Aunt March", 43, 46), ("Laurie", 50, 54),
      ("Professor Bhaer", 57, 61), ("Mr. Laurence", 64, 67), ("Mr. Brooke", 69, 72)]
HEAD = re.compile(r"^([A-Z][A-Z .'’]{2,40}?)\s*(?:[–-]|\()")
# a line in parentheses that gives ANOTHER character's words: "(Nathan - how is your cold?)"
OTHER = re.compile(r"^\((?:[A-Z][a-z]+)\s+[–-]\s.*\)$")
SKIP = {"MONOLOGUE PREP TIPS", "LITTLE WOMEN MONOLOGUES", "FEMALE MONOLOGUE OPTIONS",
        "MALE MONOLOGUE OPTIONS", "FEMALE MONOLOGUES", "MALE MONOLOGUES"}
DROP = {("Guys and Dolls", "Benny Southstreet")}  # same words as Nicely's second half


def title_case(name: str) -> str:
    name = name.strip().title().replace("Mr. ", "Mr. ")
    return {"Nicely Nice Johnson": "Nicely-Nicely Johnson", "Laurie Laurence": "Laurie",
            "Harry The Horse": "Harry the Horse"}.get(name, name)


pieces = []
for key, (title, author, year, url) in SHOWS.items():
    lines = [l.strip() for l in open(f"{D}/{key}.txt").read().split("\n")]
    cur = None
    for l in lines:
        m = HEAD.match(l)
        if m and m.group(1).strip() not in SKIP and l.split()[0].isupper():
            cur = {"character": title_case(m.group(1)), "paras": [[]]}
            pieces.append((title, author, year, url, cur))
            continue
        if cur is None or l.upper() in SKIP:
            continue
        if not l:
            continue
        if OTHER.match(l):
            cur["paras"].append([])
            continue
        if l == "Or":  # a second, separate option for the same character
            cur = {"character": cur["character"], "paras": [[]]}
            pieces.append((title, author, year, url, cur))
            continue
        cur["paras"][-1].append(l)

out = []
for title, author, year, url, p in pieces:
    if (title, p["character"]) in DROP:
        continue
    paras = [" ".join(x) for x in p["paras"] if x]
    text = "\n\n".join(paras).strip()
    out.append({"play_title": title, "author": author, "character": p["character"],
                "text": text, "year": year, "genre": "musical", "url": url})

lw = open(f"{D}/lw.txt").read().split("\n")
for character, a, b in LW:
    out.append({"play_title": "Little Women", "author": "Allan Knee", "character": character,
                "text": " ".join(" ".join(lw[a - 1:b]).split()), "year": 2005,
                "genre": "musical", "url": LW_URL})

# Mamma Mia!: only Sophie's speech clears the musical floor; the rest are under 60 words
# or written for two characters.
mm = open(f"{D}/mm2.txt").read()
s = re.search(r"\nSophie: (.*?)\n(?=Sam: )", mm, re.S)
if s:
    out.append({"play_title": "Mamma Mia!", "author": "Catherine Johnson",
                "character": "Sophie", "text": " ".join(s.group(1).split()), "year": 1999,
                "genre": "musical",
                "url": "https://static1.squarespace.com/static/5b354f181137a6c3afd78783/t/5bad26cd9140b74439a89259/1538074318205/Mamma+Mia+Audition+Packet.pdf"})

json.dump({"source": "musical audition packets, 2026-11-16", "source_url": "", "pieces": out},
          open(OUT, "w"), ensure_ascii=False, indent=1)
for p in out:
    print(len(p["text"].split()), p["play_title"], "/", p["character"], "|", p["text"][:70])
