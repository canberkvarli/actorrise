"""Audit monologue text_segments quality. Read-only; run before and after a
re-segmentation to see what moved.

    uv run python -m scripts.audit_segments

Reports coverage (how many monologues are segmented at all) and quality signals
on the segmented subset (mislabels the render depends on): a character's own
line tagged as another speaker's interjection, generic/crowd interjections that
are usually narration, and structural breakage.
"""

from sqlalchemy import text as sa_text

from app.core.database import SessionLocal


def main() -> None:
    db = SessionLocal()
    try:
        cov = db.execute(sa_text("""
            SELECT
              count(*) AS total,
              count(*) FILTER (WHERE text_segments IS NULL) AS unsegmented,
              count(*) FILTER (WHERE text_segments IS NOT NULL AND jsonb_typeof(text_segments) <> 'array') AS malformed,
              count(*) FILTER (WHERE jsonb_typeof(text_segments)='array' AND jsonb_array_length(text_segments) > 0) AS segmented
            FROM monologues
        """)).fetchone()
        total, unseg, malformed, segmented = cov

        q = db.execute(sa_text("""
            WITH seg AS (
              SELECT m.id, m.character_name AS ch, s.elem->>'type' AS type,
                     s.elem->>'speaker' AS speaker
              FROM monologues m
              CROSS JOIN LATERAL jsonb_array_elements(m.text_segments) s(elem)
              WHERE jsonb_typeof(m.text_segments)='array'
            )
            SELECT
              count(*) FILTER (WHERE type='dialogue') AS dialogue,
              count(*) FILTER (WHERE type='direction') AS direction,
              count(*) FILTER (WHERE type='interjection') AS interjection,
              count(*) FILTER (WHERE type='interjection' AND lower(speaker)=lower(ch)) AS interj_is_target,
              count(DISTINCT id) FILTER (WHERE type='interjection' AND lower(speaker)=lower(ch)) AS monos_target_mislabeled,
              count(*) FILTER (WHERE type='interjection' AND (lower(speaker) IN ('other','crowd','all','narrator','') OR speaker IS NULL)) AS interj_generic,
              (SELECT count(DISTINCT s2.id) FROM seg s2
                 WHERE NOT EXISTS (SELECT 1 FROM seg d WHERE d.id=s2.id AND d.type='dialogue')) AS no_dialogue
            FROM seg
        """)).fetchone()

        pct = lambda n: f"{100.0*n/total:.1f}%" if total else "-"
        print("── Segment audit ─────────────────────────────")
        print(f"total monologues        {total}")
        print(f"  segmented             {segmented}  ({pct(segmented)})")
        print(f"  UNSEGMENTED (null)    {unseg}  ({pct(unseg)})   <- no structured render")
        print(f"  malformed (not array) {malformed}")
        print("── Quality on segmented rows ─────────────────")
        print(f"segments: dialogue={q[0]}  direction={q[1]}  interjection={q[2]}")
        print(f"target's line tagged as interjection   {q[3]} segs / {q[4]} monos   <- always wrong")
        print(f"interjection w/ generic-or-crowd speaker {q[5]} segs   <- often narration mislabeled")
        print(f"no-dialogue (broken)                    {q[6]} monos")
    finally:
        db.close()


if __name__ == "__main__":
    main()
