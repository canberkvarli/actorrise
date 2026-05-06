# ScriptSlug Source — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ScriptSlug as a fallback film/TV source in
`extract_film_tv_monologues.py` so refs IMSDb misses (≈80% of unprocessed
top-rated catalogue) get a second chance via PDF screenplays.

**Design:** [docs/plans/2026-05-06-scriptslug-source-design.md](./2026-05-06-scriptslug-source-design.md)

**Tech stack:** Python, `pdfplumber` (already installed), `requests`, existing
`extract_film_tv_monologues.py` extraction pipeline. No new dependencies.

---

## Task 1: ScriptSlug URL builder

**Files:**
- Modify: [backend/scripts/extract_film_tv_monologues.py](backend/scripts/extract_film_tv_monologues.py) — add helper after `build_imsdb_url()` (around line 120)

**Step 1: Add `_title_to_scriptslug()`**

```python
def _title_to_scriptslug(title: str) -> str:
    slug = title.strip().lower()
    slug = re.sub(r"['']", "", slug)
    slug = re.sub(r"&", "and", slug)
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug
```

**Step 2: Add `build_scriptslug_pdf_url()`**

```python
def build_scriptslug_pdf_url(title: str, year: int | None) -> str | None:
    slug = _title_to_scriptslug(title)
    if not slug or year is None:
        return None
    return f"https://assets.scriptslug.com/live/pdf/scripts/{slug}-{year}.pdf"
```

**Step 3: Quick syntax check**

```bash
cd backend && uv run python -c "from scripts.extract_film_tv_monologues import build_scriptslug_pdf_url; print(build_scriptslug_pdf_url('The Social Network', 2010))"
```

Expected: `https://assets.scriptslug.com/live/pdf/scripts/the-social-network-2010.pdf`

---

## Task 2: PDF fetch function

**Step 1: Add constants alongside `IMSDB_HEADERS` (around line 60)**

```python
SCRIPTSLUG_HEADERS = {
    "User-Agent": "ActorRise/1.0 (audition-prep; monologue-extraction)",
    "Accept": "application/pdf,*/*",
}
SCRIPTSLUG_DELAY = 3.0
```

**Step 2: Add `fetch_script_pdf()` function**

```python
def fetch_script_pdf(url: str | None, debug: bool = False) -> bytes | None:
    """Fetch a PDF screenplay from ScriptSlug. Returns bytes or None on failure."""
    if not url:
        return None
    try:
        resp = requests.get(url, headers=SCRIPTSLUG_HEADERS, timeout=30)
        if debug:
            print(f"    DEBUG ScriptSlug: {url} → status={resp.status_code}, len={len(resp.content)}")
        if resp.status_code != 200:
            return None
        if not resp.content.startswith(b"%PDF"):
            if debug:
                print("    DEBUG ScriptSlug: not a PDF (likely HTML 404 page)")
            return None
        return resp.content
    except Exception as e:
        if debug:
            print(f"    DEBUG ScriptSlug fetch error: {e}")
        return None
```

**Step 3: Add `discover_scriptslug_pdf_url()` for the 404-fallback path**

```python
def discover_scriptslug_pdf_url(title: str, year: int | None, debug: bool = False) -> str | None:
    """Fetch the ScriptSlug metadata page and extract the canonical PDF link."""
    slug = _title_to_scriptslug(title)
    if not slug or year is None:
        return None
    page_url = f"https://www.scriptslug.com/script/{slug}-{year}"
    try:
        resp = requests.get(page_url, headers=IMSDB_HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/live/pdf/scripts/" in href and href.endswith((".pdf",)) or ".pdf?" in href:
                return href if href.startswith("http") else f"https://assets.scriptslug.com{href}"
    except Exception as e:
        if debug:
            print(f"    DEBUG ScriptSlug discover error: {e}")
    return None
```

---

## Task 3: PDF screenplay parser

**Step 1: Add `parse_screenplay_pdf()` function**

Place it next to `parse_screenplay()` (around line 130).

```python
def parse_screenplay_pdf(pdf_bytes: bytes) -> list[dict]:
    """Parse a screenplay PDF into [{character, dialogue}] blocks via
    indentation heuristics. Mirrors parse_screenplay()'s output shape."""
    import io
    import pdfplumber

    blocks: list[dict] = []
    current_char: str | None = None
    current_lines: list[str] = []

    def flush():
        nonlocal current_char, current_lines
        if current_char and current_lines:
            blocks.append({
                "character": current_char,
                "dialogue": " ".join(l.strip() for l in current_lines if l.strip()),
            })
        current_char = None
        current_lines = []

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                for line in txt.split("\n"):
                    if not line.strip():
                        # Blank line ends a dialogue block
                        flush()
                        continue
                    indent = len(line) - len(line.lstrip())
                    stripped = line.strip()
                    # Scene heading: skip
                    if re.match(r"^(INT\.|EXT\.|FADE IN|FADE OUT|CUT TO)", stripped, re.IGNORECASE):
                        flush()
                        continue
                    # Character name: indented far right, mostly UPPERCASE
                    is_caps = stripped == stripped.upper() and any(c.isalpha() for c in stripped)
                    looks_like_name = (
                        indent >= 25
                        and is_caps
                        and len(stripped) <= 40
                        and not stripped.endswith((".", "!", "?"))
                    )
                    if looks_like_name:
                        flush()
                        # Strip parentheticals: "JOHN (V.O.)" → "JOHN"
                        current_char = re.sub(r"\s*\([^)]*\)\s*$", "", stripped).strip()
                        continue
                    # Indented line under a character → dialogue
                    if current_char and indent >= 10:
                        # Skip parentheticals on their own line: "(angrily)"
                        if stripped.startswith("(") and stripped.endswith(")"):
                            continue
                        current_lines.append(stripped)
                        continue
                    # Action line at left margin → end any current dialogue block
                    if indent < 10:
                        flush()
        flush()
    except Exception as e:
        print(f"    PDF parse error: {e}")
        return []

    return blocks
```

**Step 2: Add OCR/garbage detection**

Inside `parse_screenplay_pdf`, before returning:

```python
    # Reject likely-OCR'd or non-screenplay PDFs: a real screenplay should have
    # many distinct speakers. If we got <5, the parser misfired or the PDF is
    # garbage. Caller will fall through to the "no blocks" handling.
    distinct = {b["character"] for b in blocks}
    if len(distinct) < 5 and len(blocks) > 0:
        print(f"    PDF parsed but only {len(distinct)} distinct character(s) — likely garbage; skipping")
        return []
```

---

## Task 4: Wire ScriptSlug branch into main loop

**Step 1: Add `--source` CLI flag (in `main()`, around line 502)**

```python
parser.add_argument(
    "--source",
    choices=["imsdb", "scriptslug", "both"],
    default="both",
    help="Which source to fetch from (default: both — IMSDb first, ScriptSlug fallback)",
)
```

**Step 2: Refactor the per-ref fetch block**

Find the existing block (around lines 554–572):

```python
urls = [ref.imsdb_url] if ref.imsdb_url else build_imsdb_url(title)
print(f"  [{i+1}/{len(refs)}] {title} ({year}) *{ref.imdb_rating}")
print(f"    URLs to try: {urls}")
html, working_url = fetch_script_html(urls, debug=args.debug)
if not html:
    total_fetch_errors += 1
    time.sleep(IMSDB_DELAY)
    continue
blocks = parse_screenplay(html)
```

Replace with:

```python
print(f"  [{i+1}/{len(refs)}] {title} ({year}) *{ref.imdb_rating}")

blocks: list[dict] = []
working_url: str | None = None
source_used: str | None = None

# Attempt 1: IMSDb HTML
if args.source in ("imsdb", "both"):
    urls = [ref.imsdb_url] if ref.imsdb_url else build_imsdb_url(title)
    html, working_url = fetch_script_html(urls, debug=args.debug)
    if html:
        blocks = parse_screenplay(html)
        source_used = "imsdb"

# Attempt 2: ScriptSlug PDF
if not blocks and args.source in ("scriptslug", "both"):
    pdf_url = build_scriptslug_pdf_url(title, year)
    pdf_bytes = fetch_script_pdf(pdf_url, debug=args.debug)
    if not pdf_bytes:
        # Cache-buster fallback: scrape the metadata page
        canonical = discover_scriptslug_pdf_url(title, year, debug=args.debug)
        if canonical and canonical != pdf_url:
            pdf_bytes = fetch_script_pdf(canonical, debug=args.debug)
            pdf_url = canonical
    if pdf_bytes:
        blocks = parse_screenplay_pdf(pdf_bytes)
        if blocks:
            working_url = pdf_url
            source_used = "scriptslug"
    time.sleep(SCRIPTSLUG_DELAY)

if not blocks:
    total_fetch_errors += 1
    time.sleep(IMSDB_DELAY)
    continue

print(f"    Source: {source_used} | {len(blocks)} dialogue blocks | {working_url}")
```

**Step 3: Make the source attribution flow into the saved Play record**

Find the `Play(...)` construction block. Make sure `source_url` reflects
`working_url` (which now might be a ScriptSlug URL). Verify nothing else
hardcodes "imsdb" — search for `source_url=` in the file.

---

## Task 5: First end-to-end test (10 films)

**Step 1: Cherry-pick known modern films likely on ScriptSlug**

Use `--titles` to pin the test set:

```bash
cd backend && uv run python -m scripts.extract_film_tv_monologues \
  --source scriptslug --titles "The Social Network" "Knives Out" "Get Out" \
  "Whiplash" "Lady Bird" "Birdman" "Marriage Story" "Parasite" \
  "Moonlight" "La La Land" --debug
```

**Step 2: Eyeball output**

Expected: each film either yields ≥1 monologue (success) or prints a fetch
error + skip with a clear reason. Auto-segment should fire at the end.

**Step 3: Spot check one new monologue in the DB**

```bash
uv run python -c "from app.core.database import engine; from sqlalchemy import text;
with engine.connect() as c:
    for r in c.execute(text(\"SELECT m.id, m.character_name, p.title FROM monologues m JOIN plays p ON p.id=m.play_id WHERE p.source_url LIKE '%scriptslug%' ORDER BY m.created_at DESC LIMIT 5\")):
        print(r)"
```

Verify `text_segments` is populated (the auto-segment hook ran).

---

## Task 6: Real-batch dry run

**Step 1: 200 unprocessed mid-tier refs**

```bash
cd backend && uv run python -m scripts.extract_film_tv_monologues \
  --source scriptslug --limit 200 --min-rating 6.5
```

Expect ~30–60% hit rate (IMSDb missed these because they're modern indies and
international, ScriptSlug carries a chunk of those).

**Step 2: Capture stats**

Count: scripts processed, monologues created, fetch errors, garbage-PDF
skips. If hit rate ≥20%, this is a viable source.

**Step 3: Commit Phase 1**

```bash
git add backend/scripts/extract_film_tv_monologues.py docs/plans/2026-05-06-scriptslug-source-*.md
git commit -m "feat(scripts): add ScriptSlug as a fallback film/TV source"
```

---

## Task 7: Scaling pass

If Task 6 hit rate is ≥20%, run a wider pass:

```bash
cd backend && uv run python -m scripts.extract_film_tv_monologues \
  --source scriptslug --limit 1000 --min-rating 6.0
```

Expected: ~$5–10 OpenAI cost for the LLM selection + analysis, plus zero
charge for fetches/PDF parsing.

After this run completes, the auto-segment hook fires automatically. Spot-check
the 5 most-recent monologues in the dashboard reading mode for visual quality.

---

## Completion criteria

- [ ] ScriptSlug URL builder + PDF fetcher + screenplay parser landed.
- [ ] `--source` flag works: `imsdb` only / `scriptslug` only / `both`.
- [ ] Test against 10 known modern films succeeds (≥6 of 10 yield monologues).
- [ ] Real batch produces ≥30 new monologues with `text_segments` populated by
  the auto-segment hook.
- [ ] No regressions: existing `--source imsdb` path behaves identically to
  pre-change behavior.
