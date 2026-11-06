"""Daily Actor pages and the REST writer that stores them from a cloud session.

The page shape below is copied from a live page (2026-11-05), trimmed.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import scrape_contemporary_plays as scp  # noqa: E402
from app.services.data_ingestion import rest_writer  # noqa: E402
from app.services.data_ingestion.cross_source_dedupe import text_fingerprint  # noqa: E402

SPEECH = (
    "You know, let me just like preface this with, uh, I have lived most of my life in the "
    "shadow of a brother I barely knew, and I have about this much left, ok? "
) * 4


def page(medium: str = "Play", cue: str = "Trip", second: str = "", character: str = "Trip Wyeth, a bright, funny, TV producer") -> bytes:
    return f"""
<div class="details post-dynamic" style="x"><h3 style="y"><strong><span style="color: #3366ff;">'Other Desert Cities' by Jon Robin Baitz</span></strong></h3><p style="m"><strong style="f">From</strong>: <span style="f">{medium}</span></p><p><strong>Character</strong>: <span>{character}</span></p><p><strong>Gender</strong>: <span>Male</span></p><p><strong style="f">More: <span id="more-link"><a href="http://amzn.to/1yAizdL" >Buy the Play</a></span></strong></p></div>
<div class="entry-content clear" itemprop="text">
<p><strong>{cue}</strong>: {SPEECH}</p>
<p>And I&#8217;m out. I&#8217;m done.</p>
{second}
<div id='jp-relatedposts' class='jp-relatedposts' ></div>
</div>""".encode()


LINK = scp.Link(url="https://www.dailyactor.com/monologues/x/", character_name="", label="x")


def test_reads_title_author_character_and_speech():
    parsed, why = scp.extract_dailyactor(LINK, page())
    assert why is None
    assert parsed.play_title == "Other Desert Cities"
    assert parsed.author == "Jon Robin Baitz"
    assert parsed.character_name == "Trip"
    assert parsed.text.startswith("You know")  # the cue is not part of the speech
    assert parsed.text.endswith("I’m done.")
    assert parsed.genre == "drama"
    assert parsed.url == LINK.url  # credit is the page, never the affiliate link


def test_screen_work_is_never_taken():
    for medium in ("Movie", "TV"):
        parsed, why = scp.extract_dailyactor(LINK, page(medium=medium))
        assert parsed is None and why.startswith("not_stage")


def test_musical_is_marked_musical():
    parsed, _ = scp.extract_dailyactor(LINK, page(medium="Musical"))
    assert parsed.genre == "musical"


def test_a_scene_is_not_a_monologue():
    parsed, why = scp.extract_dailyactor(LINK, page(second="<p><strong>Polly</strong>: Stop it.</p>"))
    assert parsed is None and why == "two_speakers"


def test_unnamed_speaker_falls_back_to_gender():
    html = page(cue="", character="").replace(b"<strong></strong>: ", b"")
    parsed, _ = scp.extract_dailyactor(LINK, html)
    assert parsed.character_name == "Man"


def test_sitemap_discovery_dedupes():
    xml = ("<loc>https://www.dailyactor.com/monologues/a/</loc>" * 2
           + "<loc>https://www.dailyactor.com/news/b/</loc>")
    links = scp.discover_dailyactor(scp._DA_SITEMAP, xml)
    assert [link.url for link in links] == ["https://www.dailyactor.com/monologues/a/"]


def test_no_year_and_public_domain_years_are_not_kept():
    parsed, _ = scp.extract_dailyactor(LINK, page())
    assert "no_verified_year" in scp.evaluate(parsed, {}).reasons
    old = scp.evaluate(parsed, {"other desert cities": 1900})
    assert "public_domain_era" in old.reasons
    ok = scp.evaluate(parsed, {"other desert cities": 2010})
    assert ok.category == "contemporary" and "no_verified_year" not in ok.reasons


# ── REST writer ──────────────────────────────────────────────────────────────

class FakeRest:
    def __init__(self, plays=None, dup_text=None, dup_vector=None):
        self.plays = plays or []
        #: What the database function would answer, without and with a vector.
        self.dup_text = dup_text
        self.dup_vector = dup_vector
        self.posted: list[tuple[str, dict]] = []
        self.dup_calls: list[bool] = []

    def duplicate_of(self, text, vector=None):
        self.dup_calls.append(vector is not None)
        return self.dup_vector if vector is not None else self.dup_text

    def get(self, table, **params):
        if table == "plays":
            title = params["title"][3:]
            return [p for p in self.plays if p["title"] == title
                    and ("author" not in params or p["author"] == params["author"][3:])]
        return []

    def post(self, table, body):
        self.posted.append((table, body))
        if table == "plays":
            row = {**body, "id": 900}
            self.plays.append(row)
            return [row]
        return [{**body, "id": 5000}]

    def patch(self, table, body, **params):
        return []


class FakeAnalyzer:
    def analyze_monologue(self, **kw):
        return {"tone": "dramatic", "character_gender": "male", "character_age_range": "30s"}

    def generate_search_tags(self, analysis, text, character):
        return ["family"]


def embed(texts, model, dimensions):
    return [[1.0] + [0.0] * 1535 for _ in texts]


TEXT = ("I have lived most of my life in the shadow of a brother I barely knew and "
        "everyone at this table keeps telling me what I am supposed to feel about it. ") * 5


def kwargs(**over):
    base = dict(play_title="Other Desert Cities", author="Jon Robin Baitz", character="Trip",
                text=TEXT, copyright_status="copyrighted", license_type="fair_use",
                source_url="https://www.dailyactor.com/monologues/x/", year_written=2010,
                category="contemporary", min_words=50, analyzer=FakeAnalyzer(), embed=embed)
    base.update(over)
    return base


def test_rest_inserts_play_then_monologue():
    rest = FakeRest()
    report = rest_writer.ingest_monologue_rest(rest, **kwargs())
    assert report.inserted_ids == [5000] and report.play_created
    play = rest.posted[0][1]
    assert play["language"] == "en" and play["license_type"] == "fair_use"
    mono = rest.posted[1][1]
    assert mono["embedding_vector"].startswith("[1.000000,")


def test_rest_refuses_without_rights_or_era():
    rest = FakeRest()
    assert rest_writer.ingest_monologue_rest(rest, **kwargs(license_type=None)).refused
    assert rest_writer.ingest_monologue_rest(rest, **kwargs(category=None)).refused
    assert rest.posted == []


def test_an_exact_duplicate_costs_nothing():
    """Word for word already stored: refused before the play row and the analyser."""
    rest = FakeRest(dup_text=(1, "identical_text"))
    report = rest_writer.ingest_monologue_rest(rest, **kwargs(analyzer=None, embed=None))
    assert report.duplicates == 1 and rest.posted == [] and rest.dup_calls == [False]


def test_a_near_duplicate_or_another_cut_is_refused_after_embedding():
    rest = FakeRest(dup_vector=(1, "overlapping_cut:0.0410"))
    report = rest_writer.ingest_monologue_rest(rest, **kwargs())
    assert report.duplicates == 1
    assert all(t != "monologues" for t, _ in rest.posted)
    assert rest.dup_calls == [False, True]


def test_the_vector_check_sends_the_vector_to_the_database():
    sent = {}

    class Spy(rest_writer.Rest):
        def __init__(self):
            pass

        def _call(self, method, path, body=None):
            sent.update(body)
            return []

    assert Spy().duplicate_of("words", [0.5] * 1536) is None
    assert sent["p_embedding"].startswith("[0.500000,") and sent["p_max_distance"] == 0.02


def test_rest_skips_what_was_rejected_before():
    rest = FakeRest()
    report = rest_writer.ingest_monologue_rest(rest, **kwargs(), rejected={text_fingerprint(TEXT)})
    assert report.already_rejected == 1 and rest.posted == []


# ── NYCastings and Szymkowicz ────────────────────────────────────────────────

NYC_PAGE = """
<div class="entry-content-text" itemprop="text"><p><strong>&#8220;Okay. So I guess this is it.&#8221; From the play &#8216;Rare Birds&#8217;. Evan rethinks his life. Ideal for males, 15-18 &#8211; 1-2 Minutes.</strong></p>
<p>By: Adam Szymkowicz</p>
<div dir="ltr">EVAN:<br /> I have been thinking about it all week and I</div>
<div dir="ltr">still do not know what to say to you about any of it.</div>
<div dir="ltr"></div>
<div dir="ltr">So I will just say it.</div>
<p>&#8212;&#8212;&#8212;&#8212;&#8212;&#8212;&#8212;<br /> Link to full play here: <a href="http://x">x</a></p></div>
<div class="entry-tag-cat"></div>""".encode()


def test_nycastings_joins_hard_wrapped_lines_and_reads_single_quote_titles():
    link = scp.Link(url="https://www.nycastings.com/rare-birds-teen-male-drama/", character_name="", label="")
    parsed, why = scp.extract_nycastings(link, NYC_PAGE)
    assert why is None
    assert (parsed.play_title, parsed.author, parsed.character_name) == ("Rare Birds", "Adam Szymkowicz", "Evan")
    first, second = parsed.text.split("\n\n")
    assert first == "I have been thinking about it all week and I still do not know what to say to you about any of it."
    assert second == "So I will just say it."  # stops at the rule, never takes the link line


def test_nycastings_discovery_keeps_posts_and_drops_site_pages():
    html = ('<a href="https://www.nycastings.com/pretty-theft-teen-female-drama/">'
            '<a href="https://www.nycastings.com/edit-profile/">')
    assert [link.label for link in scp.discover_nycastings("", html)] == ["pretty-theft-teen-female-drama"]


SZ_PAGE = """<div class='post-body entry-content' id='p'>
<div><span style="font-size: large;"><b><a href="https://publisher/sex-writer/">THE SEX WRITER</a></b></span></div>
<div><span>1.&nbsp;</span></div><div><span>JANE</span></div>
<div><p>Thank you, Jacob, but I think we have to stop there.</p><p>Great semester everyone.</p></div>
<div><span>2.</span></div>
<div><p>JANEThere was an artist colony.</p></div>
<div><span style="font-size: large;"><b><a href="https://www.patreon.com/x">Adam's Patreon</a></b></span></div>
<div class='post-footer'>""".encode()


def test_szymkowicz_reads_every_speech_on_the_page():
    pieces = scp._sz_pieces(SZ_PAGE.decode())
    assert [(p["play"], p["character"]) for p in pieces] == [("THE SEX WRITER", "JANE"), ("THE SEX WRITER", "JANE")]
    assert pieces[0]["paras"] == ["Thank you, Jacob, but I think we have to stop there.", "Great semester everyone."]
    assert pieces[1]["paras"] == ["There was an artist colony."]  # the glued cue is split off
    links = scp.discover_szymkowicz("https://aszym.blogspot.com/w.html", SZ_PAGE.decode())
    parsed, _ = scp.extract_szymkowicz(links[1], SZ_PAGE)
    assert (parsed.play_title, parsed.character_name, parsed.author) == ("The Sex Writer", "Jane", "Adam Szymkowicz")
    assert parsed.url.endswith("#1")
