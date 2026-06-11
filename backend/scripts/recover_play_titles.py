#!/usr/bin/env python
"""Recover real play titles for the placeholder-titled rows.

41 Play rows were ingested from Gutenberg #36984 — "Fifty Contemporary One-Act
Plays" (ed. Shay & Loving, 1920) — with their `title` set to a generic
placeholder ("A Play"/"A Comedy"...) while the author survived. This restores the
real title (from the anthology's table of contents, keyed by Play id) and tidies
the mangled author strings (strips the appended "Translated by ..." / "(original
title)" cruft).

DRY-RUN by default; --apply writes.

Usage (from backend/):
    uv run python scripts/recover_play_titles.py
    uv run python scripts/recover_play_titles.py --apply
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import func

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play

# play_id -> real title (from Gutenberg 36984 table of contents)
TITLES = {
    124: "Literature",                       # Schnitzler
    125: "The Intruder",                     # Maeterlinck
    126: "Monsieur Lamblin",                 # Ancey
    127: "Françoise's Luck",                 # de Porto-Riche
    128: "Altruism",                         # Ettlinger
    129: "The Tenor",                        # Wedekind
    130: "A Good Woman",                     # Bennett
    131: "The Little Stone House",           # Calderon
    132: "Mary's Wedding",                   # Cannan
    134: "The Baby Carriage",                # Crocker
    136: "The Subjection of Kezia",          # Mrs. Havelock Ellis
    138: "The Judgment of Indra",            # Mukerji
    139: "The Workhouse Ward",               # Lady Gregory
    140: "Louise",                           # Speenhoff
    141: "The Grandmother",                  # Biro
    142: "The Rights of the Soul",           # Giacosa
    143: "Love of One's Neighbor",           # Andreyev
    144: "The Boor",                         # Tchekoff (Chekhov)
    145: "His Widow's Husband",              # Benavente
    146: "A Sunny Morning",                  # Alvarez Quintero
    147: "The Creditor",                     # Strindberg
    148: "Autumn Fires",                     # Wied
    150: "In the Morgue",                    # Cowan
    151: "A Death in Fever Flat",            # Cronyn
    152: "The Slave with Two Faces",         # Davies
    153: "The Slump",                        # Day
    154: "Mansions",                         # Flanner
    155: "Trifles",                          # Glaspell
    156: "The Pot Boiler",                   # Gerstenberg
    157: "Enter the Hero",                   # Helburn
    159: "Boccaccio's Untold Tale",          # Kemp
    160: "Another Way Out",                  # Langner
    161: "Aria da Capo",                     # Millay
    162: "Helena's Husband",                 # Moeller
    163: "Ile",                              # O'Neill
    165: "Three Travelers Watch a Sunrise",  # Wallace Stevens
    167: "The Medicine Show",                # Walker
    168: "For All Time",                     # Wellman
    169: "The Finger of God",                # Wilde
    170: "Night",                            # Asch
    171: "Forgotten Souls",                  # Pinski
}


def clean_author(a: str) -> str:
    """Drop appended translator / original-title cruft from an author string."""
    if not a:
        return a
    a = re.split(r"\s*Translated\b|\s*\(", a)[0]
    return a.strip(" .,")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    changed = 0
    for pid, title in TITLES.items():
        p = db.query(Play).filter(Play.id == pid).first()
        if not p:
            print(f"  ! play#{pid} not found")
            continue
        n = db.query(func.count(Monologue.id)).filter(Monologue.play_id == pid).scalar()
        chars = [c for (c,) in db.query(Monologue.character_name)
                 .filter(Monologue.play_id == pid).limit(3).all()]
        new_author = clean_author(p.author)
        print(f"  play#{pid} n={n} | {new_author!r}")
        print(f"     title: {p.title!r} -> {title!r}")
        if new_author != p.author:
            print(f"     author: {p.author!r} -> {new_author!r}")
        print(f"     chars: {chars}")
        if args.apply:
            p.title = title
            p.author = new_author
            changed += 1

    if args.apply:
        db.commit()
        print(f"\nUpdated {changed} plays.")
    else:
        print(f"\nDRY RUN — {len(TITLES)} plays would be updated.")
    db.close()


if __name__ == "__main__":
    main()
