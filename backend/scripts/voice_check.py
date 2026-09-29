"""Hold a draft to Canberk's voice rules before he ever sees it.

  cd backend
  uv run python scripts/voice_check.py --kind org   path/to/draft.md
  uv run python scripts/voice_check.py --kind user  path/to/draft.md
  uv run python scripts/voice_check.py --kind social path/to/post.md
  cat draft.txt | uv run python scripts/voice_check.py --kind reply -

Exits 1 and prints one line per problem if the draft breaks a rule in
CLAUDE.md. Exits 0 and prints nothing if it is clean.

Why a script and not a paragraph in a prompt: the rules were in every prompt
already, and drafts still arrived with dashes in them. A writer asked to check
its own work finds it fine. This does not read the draft, it searches it.

The kinds, and what each adds to the rules every draft is held to:

  org     an organisation (theatre, school, studio, coach, chapter, library):
          no CURTAIN, no promise of three months
  user    a current ActorRise user: must carry the reply-UNSUBSCRIBE line
  reply   an answer on a thread already going: no CURTAIN
  social  a post: no sign-off needed

Anything headed for a Gmail draft (org, user, reply) may not contain a URL.
The Gmail connector rewrites every link into a google.com redirect, so the
domain is written actorrise<span>.</span>com and real links are left as [LINK]
for Canberk to paste.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

KINDS = ("org", "user", "reply", "social")
TO_GMAIL = ("org", "user", "reply")

DASHES = re.compile(r"[‒–—―]| - | -- ")
WE = re.compile(r"\b(we|we're|we've|we'll|our|ours|us)\b|\bthe (actorrise )?team\b", re.I)
CORPORATE = re.compile(
    r"excited to announce|thrilled|leverag(e|ing)|unlock|revolutioni[sz]e|game.?changer|synergy"
    r"|i hope this (email|message) finds you|reach(ing)? out to touch base|circle back",
    re.I,
)
EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF️]"
)
COUPON = re.compile(r"\bFOUNDER\d*\b|\bcoupon\b|\bpromo code\b|\bdiscount code\b", re.I)
CURTAIN = re.compile(r"\bCURTAIN\b")
THREE_MONTHS = re.compile(r"\b(3|three)[ -]months?\b", re.I)
UNSUBSCRIBE_LINE = re.compile(r"reply unsubscribe", re.I)
# The one spelling of the domain a Gmail draft may carry.
SAFE_DOMAIN = re.compile(r"actorrise<span>\.</span>com", re.I)
URL = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.(com|org|net|io|co|app|edu)\b", re.I)
TAGS = re.compile(r"<[^>]+>")


def _signed(text: str) -> bool:
    """Does the letter end on the name, give or take the opt-out line under it."""
    lines = [TAGS.sub("", line).strip() for line in re.split(r"\n|<br\s*/?>|</p>", text)]
    lines = [line for line in lines if line]
    tail = [line for line in lines[-3:] if not UNSUBSCRIBE_LINE.search(line)]
    return bool(tail) and tail[-1].lower().rstrip(".,") in ("canberk", "canberk varli")


def check(text: str, kind: str) -> list[str]:
    """Every rule this draft breaks, as sentences. Empty means clean."""
    if kind not in KINDS:
        raise ValueError(f"unknown kind {kind!r}; one of {KINDS}")
    problems: list[str] = []

    def found(pattern: re.Pattern, where: str, say: str) -> None:
        m = pattern.search(where)
        if m:
            problems.append(f"{say}: {m.group(0).strip()!r}")

    found(DASHES, text, "a dash")
    found(WE, TAGS.sub(" ", text), "not first person singular")
    found(CORPORATE, text, "corporate phrase")
    found(EMOJI, text, "an emoji")
    found(COUPON, text, "a coupon or a retired code")

    if kind in ("org", "reply"):
        found(CURTAIN, text, f"CURTAIN in a {kind} email")
    if kind == "org":
        found(THREE_MONTHS, text, "three months promised (educators get 1, students 2 weeks or 1 month)")
    if kind == "user" and not UNSUBSCRIBE_LINE.search(text):
        problems.append("no reply-UNSUBSCRIBE line, which every email to a current user carries")

    if kind in TO_GMAIL:
        found(URL, SAFE_DOMAIN.sub("", text), "a URL in a Gmail draft (write [LINK], or the domain with the span)")
        if not _signed(text):
            problems.append("does not sign off as Canberk")

    return problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", required=True, choices=KINDS)
    ap.add_argument("files", nargs="+", help="draft files, or - for stdin")
    args = ap.parse_args()

    bad = 0
    for name in args.files:
        text = sys.stdin.read() if name == "-" else Path(name).read_text(encoding="utf-8")
        for problem in check(text, args.kind):
            bad += 1
            print(f"{name}: {problem}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
