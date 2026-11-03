"""Build the SQL that imports a proofread Turkish play into the library (CAN-21).

A cloud session cannot open a database connection, so this does everything that
needs the network apart from Postgres: the AI analysis (emotion, tone, age,
gender, themes, difficulty), the embedding, and the segments. It writes one SQL
file, which is then run through the Supabase SQL tool (or psql on the laptop).

Every monologue goes in with review_status = 'pending', which hides it from
search, browse and the public pages (HIDDEN_REVIEW_STATUSES). Canberk reads each
one as a native speaker and the reviewed ones are released with:

    UPDATE monologues SET review_status = NULL WHERE id IN (...);

Input JSON (one play):
    {"play": {title, author, year_written, genre, category, translator,
              publisher, source_url, copyright_note},
     "monologues": [{id, character, act, scene, text, scene_description_tr,
                     character_description_tr}]}

    uv run python scripts/build_turkish_import.py <input.json> <out.sql>

Does not import app.main (no schedulers start).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.ai.content_analyzer import ContentAnalyzer  # noqa: E402

WPM = 150  # same reading speed the English library uses (Monologue.estimated_duration_seconds)


def q(v) -> str:
    """SQL literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, tuple)):
        return "ARRAY[" + ",".join(q(x) for x in v) + "]::varchar[]" if v else "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def segments(text: str) -> list[dict]:
    """Dialogue, with parenthesised stage directions as their own segments."""
    out = []
    for part in re.split(r"(\([^)]*\))", text):
        part = part.strip()
        if not part:
            continue
        out.append({"type": "direction" if part.startswith("(") else "dialogue", "text": part})
    return out


def first_line(text: str, n: int = 7) -> str:
    words = re.sub(r"\([^)]*\)", "", text).split()
    line = " ".join(words[:n]).rstrip(",;:—-")
    return line + ("…" if len(words) > n else "")


def main(src: str, out: str) -> None:
    data = json.loads(Path(src).read_text())
    play, mons = data["play"], data["monologues"]
    ai = ContentAnalyzer()

    sql = ["BEGIN;"]
    sql.append(
        "INSERT INTO plays (title, author, year_written, genre, category, source_type,"
        " copyright_status, license_type, source_url, publisher, translator, language) VALUES ("
        + ", ".join(q(play[k]) for k in ("title", "author", "year_written", "genre", "category"))
        + ", 'play', 'public_domain', " + q(play.get("copyright_note"))
        + ", " + q(play.get("source_url")) + ", " + q(play.get("publisher"))
        + ", " + q(play["translator"]) + ", 'tr');"
    )
    # The Supabase SQL tool has no \gset, so each monologue looks the play up.
    play_ref = (
        f"(SELECT id FROM plays WHERE title = {q(play['title'])} AND language = 'tr'"
        f" AND translator = {q(play['translator'])} ORDER BY id DESC LIMIT 1)"
    )

    report = []
    for m in mons:
        text = m["text"].strip()
        wc = len(re.sub(r"\([^)]*\)", "", text).split())
        a = ai.analyze_monologue(text=text, character=m["character"], play_title=play["title"], author=play["author"])
        themes = [t for t in (a.get("themes") or []) if isinstance(t, str)][:6]
        enriched = " ".join(filter(None, [
            f"{m['character']} from {play['title']} by {play['author']} (Turkish, tr. {play['translator']}).",
            a.get("primary_emotion") and f"Emotion: {a['primary_emotion']}.",
            a.get("tone") and f"Tone: {a['tone']}.",
            a.get("character_gender") and f"Gender: {a['character_gender']}.",
            a.get("character_age_range") and f"Age: {a['character_age_range']}.",
            themes and f"Themes: {', '.join(themes)}.",
            a.get("difficulty_level") and f"Difficulty: {a['difficulty_level']}.",
            text[:800],
        ]))
        vec = ai.generate_embedding(enriched)
        if len(vec) != 1536:
            raise SystemExit(f"embedding failed for {m['id']}")
        tags = sorted(set(ai.generate_search_tags(a, text, m["character"])))
        title = f"{m['character']}: “{first_line(text)}”"
        sql.append(
            "INSERT INTO monologues (play_id, title, character_name, text, text_segments, act, scene,"
            " character_gender, character_age_range, character_description, word_count,"
            " estimated_duration_seconds, difficulty_level, primary_emotion, emotion_scores, themes, tone,"
            " scene_description, embedding_vector, search_tags, review_status) VALUES ("
            + ", ".join([
                play_ref, q(title), q(m["character"]), q(text), q(json.dumps(segments(text), ensure_ascii=False)) + "::jsonb",
                q(m.get("act")), q(m.get("scene")),
                q(a.get("character_gender")), q(a.get("character_age_range")), q(m.get("character_description_tr")),
                q(wc), q(round(wc / WPM * 60)), q(a.get("difficulty_level")), q(a.get("primary_emotion")),
                q(json.dumps(a.get("emotion_scores") or {})) + "::jsonb", q(themes), q(a.get("tone")),
                q(m.get("scene_description_tr")), q("[" + ",".join(f"{x:.6f}" for x in vec) + "]") + "::halfvec(1536)",
                q(tags), "'pending'",
            ])
            + ");"
        )
        report.append((m["id"], wc, a.get("tone"), a.get("primary_emotion"), a.get("character_gender"), a.get("character_age_range")))
        print(f"  {m['id']:<28} {wc:>4}w  {a.get('tone')}/{a.get('primary_emotion')}  {a.get('character_gender')} {a.get('character_age_range')}")

    sql.append("COMMIT;")
    Path(out).write_text("\n".join(sql) + "\n")
    print(f"{len(mons)} monologues -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
