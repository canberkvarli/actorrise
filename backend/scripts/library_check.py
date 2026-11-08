"""Is it in the library? The three-place check, as one read-only command.

  uv run python scripts/library_check.py "Poor Things"
  uv run python scripts/library_check.py "Bella Baxter"
  uv run python scripts/library_check.py --emotion jealousy

A search note says what is in and what is not, and "not in" is the claim that
bites (2026-10-05: a note said nothing from Sentimental Value was in; the film's
rows carried it only as the play title). So every phrase is looked up in all
three places, `plays.title`, `monologues.title` and `monologues.character_name`,
counting only pieces an actor can see: the review gate and the English library
(exclude_hidden), and the film/TV word gate.

A full name with no character hit is tried word by word, since the corpus often
keeps a first name only ("Bella Baxter" is filed as "Bella").

`--emotion` counts the visible pieces whose primary emotion is the word.

Read only. It runs over the bridge (scripts/remote.py library_check ...) so a
cloud session can verify a note before sending it.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

SHOW = 10
NOT_A_NAME = {"the", "and", "monologue", "monologues", "from", "for", "scene", "speech", "film", "play", "show"}


def fallback_words(phrase: str) -> list[str]:
    """The words of a full name worth trying alone, longest first."""
    words = [w for w in re.findall(r"[^\W\d_]+", phrase)
             if len(w) >= 3 and w.lower() not in NOT_A_NAME]
    return sorted(dict.fromkeys(words), key=len, reverse=True) if len(words) > 1 else []


def report(label: str, rows: list) -> list[str]:
    """One line per play: how many pieces, whose, and their ids."""
    plays: dict[tuple, list] = {}
    for m in rows:
        p = m.play
        plays.setdefault((p.title, p.author, p.source_type) if p else ("no play", "", ""), []).append(m)
    out = [f"{label}: {len(rows)} pieces in {len(plays)} titles"]
    for (title, author, kind), ms in sorted(plays.items(), key=lambda kv: -len(kv[1]))[:SHOW]:
        who = sorted({m.character_name for m in ms})
        ids = ", ".join(f"#{m.id}" for m in ms[:6]) + (" ..." if len(ms) > 6 else "")
        out.append(f"  {title} ({author}, {kind}): {len(ms)}, {', '.join(who[:4])}; {ids}")
    if len(plays) > SHOW:
        out.append(f"  ... and {len(plays) - SHOW} more titles")
    return out


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")
    ap = argparse.ArgumentParser()
    ap.add_argument("phrase")
    ap.add_argument("--emotion", action="store_true", help="count pieces with this primary emotion")
    args = ap.parse_args()
    phrase = args.phrase.strip()
    if len(phrase) < 2:
        sys.exit("give a title, character or emotion")

    from sqlalchemy import func
    from sqlalchemy.orm import Session, joinedload

    from app.core.database import engine
    from app.models.actor import Monologue, Play
    from app.services.search.semantic_search import exclude_hidden, film_tv_word_gate_hides

    with engine.connect().execution_options(postgresql_readonly=True) as conn, Session(bind=conn) as db:
        def visible(*conds) -> list:
            q = exclude_hidden(db.query(Monologue).join(Play, Monologue.play_id == Play.id)
                               .options(joinedload(Monologue.play)).filter(*conds))
            rows = q.order_by(Play.title, Monologue.character_name, Monologue.id).limit(500).all()
            return [m for m in rows
                    if not film_tv_word_gate_hides(m.play.source_type if m.play else None, m.word_count)]

        like = f"%{phrase}%"
        if args.emotion:
            rows = visible(func.lower(Monologue.primary_emotion) == phrase.lower())
            print("\n".join(report(f"primary emotion \"{phrase}\"", rows)))
            return

        lines = [f"# \"{phrase}\" in the library (visible pieces only)"]
        by_play = visible(Play.title.ilike(like))
        lines += report("play title", by_play)
        lines += report("monologue title", visible(Monologue.title.ilike(like)))
        by_char = visible(Monologue.character_name.ilike(like))
        lines += report("character name", by_char)

        if not by_char:
            for w in fallback_words(phrase):
                hits = visible(Monologue.character_name.op("~*")(rf"\m{re.escape(w)}\M"))
                if hits:
                    lines += report(f"character name, \"{w}\" alone (check it is the same person)", hits)

        if not by_play:
            shells = (db.query(Play.title, Play.source_type, Play.copyright_status)
                      .filter(Play.title.ilike(like)).limit(SHOW).all())
            for title, kind, rights in shells:
                lines.append(f"listed, no visible pieces: {title} ({kind}, {rights})")
        print("\n".join(lines))


if __name__ == "__main__":
    main()
