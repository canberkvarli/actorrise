"""One-off: regenerate the Ghost Light iOS app's cold-start fixtures.

The app (../ghostlight) ships src/data/monologues.ts as the offline / discover
cold-start fallback. Historically 19 of 20 fixtures carried only a two-line
excerpt (no fullText), so a user landing on the discover fallback saw two lines
plus "(the rest arrives with the live text.)" — an App Store risk (looks like
half-loaded, partial content).

This script replaces those fixtures with a curated set of genuinely iconic,
CLEAN, PUBLIC-DOMAIN monologues pulled verbatim from the live catalog, each
with real fullText so every fallback read is complete. Public-domain only
because fixtures bundle the whole speech into the app binary.

Run from backend/:  uv run python scripts/gen_ghostlight_fixtures.py
Writes: ../ghostlight/src/data/monologues.ts  (array body only; header + helpers
preserved). Prints a summary; make no commit.
"""

import json
import re
from pathlib import Path

from sqlalchemy import text

from app.core.database import SessionLocal

OUT = Path("/Users/canberkvarli/Development/ghostlight/src/data/monologues.ts")

# Curated picks: (catalog monologue id, human title). Order is the showcase
# order. 8 female / 8 male (incl. the preserved Hamlet), spread across
# Shakespeare, Chekhov, Marlowe, Wilde, Shaw; dramatic + comedic + seriocomic.
PICKS = [
    (12207, "We shall find peace"),        # Sonya — Uncle Vanya (F, closing speech)
    (19580, "Was this the face"),          # Faustus — Doctor Faustus (M, Helen of Troy)
    (4284,  "A moment, Mr. Worthing"),     # Lady Bracknell — Importance of Being Earnest (F, comedic)
    (2885,  "The forests of Russia"),      # Astroff — Uncle Vanya (M)
    (23691, "Men, lions, eagles"),         # Nina — The Sea-Gull (F, play-within-a-play)
    (23731, "How I got on"),               # Mrs Warren — Mrs Warren's Profession (F)
    (2949,  "The old actor"),              # Svietlovidoff — Swan Song (M)
    (4435,  "Tommy proposed again"),       # Mabel Chiltern — An Ideal Husband (F, comedic)
    (23698, "A writer's life"),            # Trigorin — The Sea-Gull (M)
    (23717, "What I am"),                  # Vivie — Mrs Warren's Profession (F)
    (14845, "The professor"),              # Voitski — Uncle Vanya (M, seriocomic)
    (4503,  "The ideal man"),              # Mrs Allonby — A Woman of No Importance (F, seriocomic)
    (23690, "New forms"),                  # Treplieff — The Sea-Gull (M)
    (12068, "How secretive of him"),       # Gwendolen — Importance of Being Earnest (F, comedic)
    (19582, "Machiavel's prologue"),       # Machiavel — The Jew of Malta (M)
]

COMEDIC = {"comedic", "witty", "joyful", "playful"}
SERIOCOMIC = {"sarcastic", "sardonic", "wry"}

# Trailing leakage: the speech is clean, but a stage direction or the partner's
# next line got appended. Truncate the body at (and including) this marker.
TRIM = {
    2885: "He goes toward the house",       # Astroff — trailing stage direction
    19582: "BARABAS discovered",            # Machiavel — trailing stage direction
    23717: "MRS WARREN",                    # Vivie — mother's reply leaked in
    12207: "Chekhov, Anton",                # Sonya — Dover citation appended
}


def to_tone(raw: str) -> str:
    t = (raw or "").lower()
    if t in COMEDIC:
        return "comedic"
    if t in SERIOCOMIC:
        return "seriocomic"
    return "dramatic"


def to_age(raw: str) -> str:
    a = (raw or "").strip()
    m = {
        "20-30": "20s–30s", "30-40": "30s–40s", "40-50": "40s–50s",
        "20s": "20s", "30s": "30s", "40s": "40s", "50s": "50s", "60s": "60s",
        "60+": "60s+", "teens": "teens", "Young Adult, Adult": "20s–30s",
        "Young Adult": "20s", "Adult": "30s–40s",
    }
    return m.get(a, a if a and a.lower() != "any" else "—")


def to_gender(raw: str) -> str:
    g = (raw or "").lower()
    if "female" in g or g in ("f", "woman"):
        return "female"
    if "male" in g or g in ("m", "man"):
        return "male"
    return "any"


def make_excerpt(body: str) -> str:
    """A real two-line teaser. Verse keeps its own line breaks; prose is split
    into two sentences so the card shows something shaped, not a wall."""
    lines = [ln.strip() for ln in body.split("\n") if ln.strip()]
    if len(lines) >= 2:
        return "\n".join(lines[:2])
    # Prose: first two sentences, capped so the card stays two-ish lines.
    prose = re.sub(r"\s+", " ", body).strip()
    parts = re.split(r"(?<=[.!?])\s+", prose)
    line1 = parts[0].strip()
    line2 = parts[1].strip() if len(parts) > 1 else ""
    if len(line1) > 120:
        line1 = line1[:117].rstrip() + "…"
        line2 = ""
    if line2 and len(line1) + len(line2) > 170:
        line2 = line2[: max(0, 170 - len(line1))].rstrip() + "…"
    return (line1 + ("\n" + line2 if line2 else "")).strip()


def clean(body: str) -> str:
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def emit(obj: dict) -> str:
    order = ["id", "title", "source", "author", "character", "ageRange",
             "gender", "tone", "sourceType", "duration", "overdoneScore",
             "excerpt", "fullText"]
    lines = ["  {"]
    for k in order:
        lines.append(f"    {k}: {json.dumps(obj[k], ensure_ascii=False)},")
    lines.append("  },")
    return "\n".join(lines)


def main() -> None:
    existing = OUT.read_text(encoding="utf-8")

    # Preserve the header (everything up to the array open) and the tail
    # (helpers after the array close) verbatim.
    head = existing.split("export const MONOLOGUES: Monologue[] = [", 1)[0]
    tail = "];" + existing.split("\n];", 1)[1]

    # Preserve the Hamlet fixture (m-001) byte-for-byte as entry #1.
    m = re.search(r"\n(  \{\n    id: 'm-001',.*?\n  \},)\n", existing, re.S)
    hamlet_block = m.group(1)

    db = SessionLocal()
    rows_by_id = {}
    try:
        for mono_id, _title in PICKS:
            r = db.execute(text(
                """
                select m.id, m.character_name, m.character_gender, m.character_age_range,
                       m.tone, m.estimated_duration_seconds, m.overdone_score, m.text,
                       p.title as source, p.author, p.source_type
                from monologues m join plays p on p.id = m.play_id
                where m.id = :id
                """
            ), {"id": mono_id}).mappings().first()
            if not r:
                raise SystemExit(f"missing catalog id {mono_id}")
            rows_by_id[mono_id] = r
    finally:
        db.close()

    objs = []
    for i, (mono_id, title) in enumerate(PICKS, start=2):
        r = rows_by_id[mono_id]
        body = clean(r["text"])
        marker = TRIM.get(mono_id)
        if marker:
            cut = body.find(marker)
            if cut == -1:
                raise SystemExit(f"trim marker {marker!r} not found in id {mono_id}")
            body = body[:cut].rstrip()
        objs.append({
            "id": f"m-{i:03d}",
            "title": title,
            "source": r["source"],
            "author": r["author"],
            "character": r["character_name"],
            "ageRange": to_age(r["character_age_range"]),
            "gender": to_gender(r["character_gender"]),
            "tone": to_tone(r["tone"]),
            "sourceType": (r["source_type"] or "play"),
            "duration": int(r["estimated_duration_seconds"] or 0),
            "overdoneScore": round(float(r["overdone_score"] or 0) * 100),
            "excerpt": make_excerpt(body),
            "fullText": body,
        })

    body_ts = "export const MONOLOGUES: Monologue[] = [\n"
    body_ts += hamlet_block + "\n"
    body_ts += "\n".join(emit(o) for o in objs) + "\n"

    # Refresh the file docstring counts.
    head = head.replace(
        "Step 0 fixture data. Twenty monologues, hardcoded, no network.",
        f"Cold-start / offline fixture data. {len(objs) + 1} monologues, hardcoded,\n"
        " * no network. Every one carries its full text (all public domain), so the\n"
        " * discover fallback and offline reads are always complete, never a fragment.",
    )

    OUT.write_text(head + body_ts + tail, encoding="utf-8")

    f = sum(1 for o in objs if o["gender"] == "female") + 0  # Hamlet is male
    print(f"wrote {OUT}")
    print(f"  {len(objs) + 1} fixtures (+ Hamlet preserved)")
    print(f"  female={f}  male={len(objs) + 1 - f}")
    tones = {}
    for o in objs:
        tones[o["tone"]] = tones.get(o["tone"], 0) + 1
    print(f"  tones={tones}")
    print("  all fullText present:", all(o["fullText"] for o in objs))


if __name__ == "__main__":
    main()
