"""Sides as a studio actually sends them.

Heidi Marshall Studio reported (2026-08-31) that an upload "didn't catch all
the dialogue correctly" and sent the file. It carried three artifacts, none of
which appear in a clean script:

  - a casting-site watermark set at an angle across every page, which
    pdfplumber lays out by y-position so each glyph lands on its own line
  - fake-bold headers, drawn twice in place, which read back doubled
  - revision asterisks, which ride on the speaker cue ("HENRY *") and stop it
    reading as a cue, so the speech is swallowed by the line above

The studio's file is their property and is not in the repo, so the PDFs here
are built by hand to reproduce the same geometry.
"""

import io

import pdfplumber

from app.services.script_parser import (
    ScriptParser,
    _has_title_page,
    _is_usable_title,
    _strip_production_marks,
    _title_from_filename,
    extract_pdf_text,
    parse_dialogue,
)

# 12pt Courier, no rotation.
UPRIGHT = "12 0 0 12"
# 12pt Helvetica turned ~53 degrees, the angle a sides watermark comes in at.
ANGLED = "7.2 9.6 -9.6 7.2"


def _pdf(*blocks: str) -> bytes:
    """A one-page PDF. Each block is a Tm matrix, an x/y, and a string."""
    stream = "\n".join(
        f"BT /F1 1 Tf {matrix} {x} {y} Tm ({text}) Tj ET"
        for matrix, x, y, text in (b.split("|") for b in blocks)
    )
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n".encode("latin-1")

    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1")
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode("latin-1")
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode("latin-1")
    return bytes(out)


def _plain_text(pdf: bytes) -> str:
    """What pdfplumber returns with no filtering at all."""
    with pdfplumber.open(io.BytesIO(pdf)) as doc:
        return "\n\n".join(p.extract_text() or "" for p in doc.pages).strip()


class TestWatermarkedSides:
    def test_angled_watermark_is_dropped(self):
        pdf = _pdf(
            f"{UPRIGHT}|252|700|FERGUSON",
            f"{UPRIGHT}|180|686|Why cant I speak?",
            f"{ANGLED}|60|300|MICHELLE - Aug 12, 2026 2:22 PM",
        )

        text = extract_pdf_text(pdf)

        assert "FERGUSON" in text
        assert "Why cant I speak?" in text
        assert "MICHELLE" not in text
        assert "2:22" not in text

    def test_dialogue_keeps_its_line_structure(self):
        # The watermark sits between the cue and the line it belongs to. Left
        # in, its glyphs break the pair onto separate lines and the cue stops
        # reading as a cue.
        pdf = _pdf(
            f"{UPRIGHT}|252|700|HENRY",
            f"{ANGLED}|300|695|MICHELLE",
            f"{UPRIGHT}|180|686|How old are you?",
        )

        lines = [ln for ln in extract_pdf_text(pdf).split("\n") if ln.strip()]

        assert lines == ["HENRY", "How old are you?"]

    def test_a_fully_rotated_page_survives(self):
        # A landscape scan is angled end to end. That is not a watermark, and
        # dropping every glyph would hand back an empty script.
        pdf = _pdf(f"{ANGLED}|60|300|FERGUSON", f"{ANGLED}|80|300|Why cant I speak?")

        assert extract_pdf_text(pdf) == _plain_text(pdf)

    def test_fake_bold_is_not_read_as_doubled_letters(self):
        # Revision headers are bolded by drawing the string twice in place.
        pdf = _pdf(
            f"{UPRIGHT}|54|700|CONTINUED:",
            f"{UPRIGHT}|54|700|CONTINUED:",
        )

        assert extract_pdf_text(pdf) == "CONTINUED:"

    def test_a_real_double_letter_survives(self):
        # The copies sit on top of each other; "ll" is a character apart.
        pdf = _pdf(f"{UPRIGHT}|54|700|KATHLEEN")

        assert extract_pdf_text(pdf) == "KATHLEEN"

    def test_unwatermarked_pdf_is_untouched(self):
        pdf = _pdf(f"{UPRIGHT}|252|700|JASON", f"{UPRIGHT}|180|686|Court order.")

        assert extract_pdf_text(pdf) == _plain_text(pdf)


REVISED_SIDE = """105 PINK REVISED PAGES (07/31/26) 17.
17 CONTINUED: 17
When an Associate, HENRY from Jason's firm steps in. *
HENRY *
Can I help you?
FERGUSON
I was at Stuyvesant High.
(CONTINUED)
"""


class TestProductionMarks:
    def test_a_cue_wearing_a_revision_asterisk_still_reads_as_a_cue(self):
        speakers = {
            line["character"]
            for section in parse_dialogue(REVISED_SIDE)
            for line in section["lines"]
        }

        assert "HENRY" in speakers

    def test_the_speech_under_a_marked_cue_is_not_swallowed(self):
        lines = [
            line
            for section in parse_dialogue(REVISED_SIDE)
            for line in section["lines"]
            if line["character"] == "HENRY"
        ]

        assert [line["text"] for line in lines] == ["Can I help you?"]

    def test_page_furniture_is_dropped(self):
        kept = _strip_production_marks(REVISED_SIDE)

        assert "REVISED PAGES" not in kept
        assert "CONTINUED" not in kept
        assert "I was at Stuyvesant High." in kept

    def test_dialogue_is_left_alone(self):
        # Nothing here is furniture, so nothing may move.
        play = "HAMLET\nTo be, or not to be.\nHORATIO\nMy lord?\n"

        assert _strip_production_marks(play) == play


class TestTitle:
    """A side has no title, and guessing at one names it after the furniture.

    The shelf filled up with "EXT. GARDEN - NIGHT" and "2 : A 2 :" because the
    parser reached for the most prominent line on page one. Three passes at
    teaching it which line is "really" the title each failed differently, so
    the question changed: does this document have a title page at all?
    """

    SIDE = "18 INT/EXT. COURTHOUSE - FRONT STEPS - LATER 18\nA MONTAGE:\nFERGUSON\nWhy?\n"
    SCREENPLAY = "WORTH\n\nWritten by\n\nMax Borenstein\n\nINT. OFFICE - DAY\n"
    PLAY = "A Midsummer Night's Dream\nby William Shakespeare\n\nTHESEUS\nNow, fair Hippolyta.\n"

    def test_a_side_has_no_title_page(self):
        assert not _has_title_page(self.SIDE)

    def test_a_title_page_is_recognised(self):
        assert _has_title_page(self.SCREENPLAY)

    def test_a_play_is_not_mistaken_for_a_side(self):
        assert _has_title_page(self.PLAY)

    def test_no_title_is_offered_for_a_side(self):
        # __new__ skips __init__, which wants an OpenAI key we don't need here.
        parser = ScriptParser.__new__(ScriptParser)

        assert parser._detect_title_hint(self.SIDE) is None

    def test_the_file_name_becomes_the_title(self):
        assert _title_from_filename("ANITA_FERGUSON_SIDES.pdf") == "Anita Ferguson Sides"
        assert _title_from_filename("Ryan - Side 1.pdf") == "Ryan Side 1"
        assert _title_from_filename("") == "Untitled Script"

    def test_a_storage_key_is_not_a_title(self):
        # Some uploads arrive named after their own UUID.
        assert (
            _title_from_filename("d7e46d88-a322-4a9f-a040-85b3ee8457a3.pdf")
            == "Untitled Script"
        )
        # A hex-ish real name must survive: "Ada Cafe" is not a storage key.
        assert _title_from_filename("Ada Cafe.pdf") == "Ada Cafe.pdf".removesuffix(".pdf")

    def test_furniture_is_never_a_usable_title(self):
        for furniture in ("EXT. GARDEN - NIGHT", "A MONTAGE:", "18 INT. BAR - DAY",
                          "FERGUSON (CONT'D)", "Untitled Script", "2 : A 2 :"):
            assert not _is_usable_title(furniture), furniture

    def test_a_real_title_still_passes(self):
        for title in ("Hamlet", "A Midsummer Night's Dream", "The Breakup"):
            assert _is_usable_title(title), title
