"""
AI-powered quality guard for monologue ingestion.

Classifies extracted text snippets as real monologue speech ('m') or
garbage (catalog entries, bibliographic listings, etc.) ('c') using
gpt-4o-mini. Call filter_monologues() before saving to DB.

Cost: ~$0.0001 per 10 monologues. Adds ~1-3s per batch of 50.
"""

from __future__ import annotations

import os
import time
from typing import TypeVar

GUARD_MODEL = "gpt-4o-mini"
BATCH_SIZE = 10
EXCERPT_LEN = 120  # chars — enough to classify, keeps tokens low

SYSTEM_PROMPT = """You are a classifier for a theater monologue database.
You will receive a numbered list of text excerpts. For each one, decide:
  m — actual dramatic speech, character dialogue, or narrative from a play/script
  c — anything NOT a monologue: bibliographic listing, cast list, play catalog,
      author biography, stage directions reference, table of contents,
      publishing ad, or any non-dramatic text

Reply with ONLY a comma-separated list of labels in the same order, e.g.:
m,c,m,m,c
No spaces, no other text, just the labels."""

T = TypeVar("T")


def _classify_batch(client, texts: list[str]) -> list[str]:
    """
    Classify a list of text excerpts. Returns a list of 'm' or 'c' labels.
    Falls back to 'm' (keep) on any API error.
    """
    numbered = "\n\n".join(
        f"{i+1}. {txt[:EXCERPT_LEN].replace(chr(34), chr(39))}"
        for i, txt in enumerate(texts)
    )

    for attempt in range(4):
        try:
            resp = client.chat.completions.create(
                model=GUARD_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": numbered},
                ],
                max_tokens=60,
                temperature=0,
            )
            raw = resp.choices[0].message.content.strip().lower()
            labels = [lbl.strip() for lbl in raw.split(",")]
            # Pad with 'm' if response is shorter than expected
            while len(labels) < len(texts):
                labels.append("m")
            return labels[: len(texts)]

        except Exception as e:
            msg = str(e)
            if "429" in msg and attempt < 3:
                time.sleep(2**attempt)
                continue
            # On any unrecoverable error, keep everything (fail open)
            print(f"  [quality_guard] API error (keeping all): {e}")
            return ["m"] * len(texts)

    return ["m"] * len(texts)


def filter_monologues(monologues: list[T], text_key: str = "text") -> list[T]:
    """
    Filter a list of monologue dicts, keeping only those classified as real
    dramatic speech by gpt-4o-mini.

    Args:
        monologues: List of dicts with at least a ``text_key`` field.
        text_key: Dict key containing the monologue text (default: "text").

    Returns:
        Filtered list with garbage entries removed.

    If OPENAI_API_KEY is not set, returns the original list unchanged (fail open).
    """
    if not monologues:
        return monologues

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("  [quality_guard] OPENAI_API_KEY not set — skipping quality check.")
        return monologues

    try:
        import openai
    except ImportError:
        print("  [quality_guard] openai package not installed — skipping quality check.")
        return monologues

    client = openai.OpenAI(api_key=api_key)

    texts = [str(m.get(text_key, "") if isinstance(m, dict) else getattr(m, text_key, "")) for m in monologues]

    # Process in batches
    labels: list[str] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch_texts = texts[i : i + BATCH_SIZE]
        batch_labels = _classify_batch(client, batch_texts)
        labels.extend(batch_labels)

    kept = [m for m, lbl in zip(monologues, labels) if lbl != "c"]
    dropped = len(monologues) - len(kept)

    if dropped:
        print(f"  [quality_guard] Filtered {dropped}/{len(monologues)} garbage entries.")

    return kept
