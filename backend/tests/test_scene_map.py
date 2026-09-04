"""The scene map — the complete list of what is in a play.

The map is the thing an actor picks from, so the failure that matters is a
*silent* one: a play that yields three scenes when it has twenty, with nothing
saying so. Every test here is about not losing a scene.
"""

import pytest

from app.services.scene_map import (
    PageOffsets,
    detect_scene_spans,
    looks_under_segmented,
    pages_for_span,
)


HAMLET_ISH = """ACT I

SCENE I. Elsinore. A platform before the castle.

BARNARDO
Who's there?

FRANCISCO
Nay, answer me: stand, and unfold yourself.

SCENE II. A room of state in the castle.

CLAUDIUS
Though yet of Hamlet our dear brother's death
the memory be green.

HAMLET
A little more than kin, and less than kind.

ACT II

SCENE I. A room in Polonius' house.

POLONIUS
Give him this money and these notes, Reynaldo.

REYNALDO
I will, my lord.
"""


class TestSpans:
    def test_finds_every_act_and_scene(self):
        spans = detect_scene_spans(HAMLET_ISH)
        assert [(s.act_label, s.scene_label) for s in spans] == [
            ("Act 1", "Scene 1"),
            ("Act 1", "Scene 2"),
            ("Act 2", "Scene 1"),
        ]

    def test_spans_cover_the_text_without_gaps(self):
        # A gap is a piece of the play nobody can pick. Spans must tile.
        spans = detect_scene_spans(HAMLET_ISH)
        for earlier, later in zip(spans, spans[1:]):
            assert earlier.char_end == later.char_start

    def test_span_text_is_the_slice_it_claims(self):
        spans = detect_scene_spans(HAMLET_ISH)
        for s in spans:
            assert HAMLET_ISH[s.char_start:s.char_end] == s.text

    def test_carries_the_characters_who_speak(self):
        spans = detect_scene_spans(HAMLET_ISH)
        assert set(spans[0].characters) == {"BARNARDO", "FRANCISCO"}
        assert set(spans[2].characters) == {"POLONIUS", "REYNALDO"}

    def test_a_long_scene_stays_one_scene(self):
        # detect_structure splits at MAX_CHUNK_CHARS for the AI extractor's
        # benefit. The map must not inherit that: a long scene split into three
        # chunks would show up as Act 1 Scene 2 three times.
        long_speech = "HAMLET\n" + ("To be, or not to be. " * 4000) + "\n"
        text = "ACT I\n\nSCENE I.\n\n" + long_speech + "\nSCENE II.\n\nHORATIO\nMy lord.\n"
        spans = detect_scene_spans(text)
        assert len(spans) == 2
        assert spans[0].char_count > 60000

    def test_text_with_no_headers_is_one_span_not_zero(self):
        # A side with the header cropped off still has to be pickable.
        spans = detect_scene_spans("ANITA\nWhy can't I speak?\n\nCLERK\nI'm sorry.\n")
        assert len(spans) == 1
        assert set(spans[0].characters) == {"ANITA", "CLERK"}

    def test_screenplay_slugs_become_scenes(self):
        text = (
            "INT. COURTHOUSE - DAY\n\nANITA\nWhy can't I speak?\n\n"
            "EXT. PARKING LOT - NIGHT\n\nHENRY\nYou need to be on the lawsuit.\n\n"
            "INT. CAR - CONTINUOUS\n\nANITA\nThen put me on it.\n"
        )
        spans = detect_scene_spans(text)
        assert len(spans) == 3
        assert spans[0].scene_label == "INT. COURTHOUSE - DAY"


class TestContentsPage:
    """A printed table of contents is not nineteen scenes.

    Real Hamlet, 144 pages: the first nineteen rows of the map were the book's
    own contents page. `ACT 1 SCENE 1` printed on page 2 matches the same regex
    as the real heading on page 8, so the map opened with a run of empty scenes
    carrying no cast and no dialogue, and repeated Acts 1 to 5 before the play
    had started.
    """

    CONTENTS = """THE TRAGEDY OF HAMLET

Contents

ACT 1
SCENE 1
SCENE 2
SCENE 3

ACT 2
SCENE 1

ACT 1

SCENE 1. Elsinore. A platform before the castle.

BARNARDO
Who's there?

FRANCISCO
Nay, answer me: stand, and unfold yourself.
"""

    def test_the_contents_page_does_not_become_scenes(self):
        spans = detect_scene_spans(self.CONTENTS)
        # Only the real scene survives: the listed ones have no dialogue in them.
        assert len(spans) == 1
        assert set(spans[0].characters) == {"BARNARDO", "FRANCISCO"}

    def test_the_last_contents_entry_does_not_swallow_the_front_matter(self):
        # Real Hamlet, the survivor of the contents page. The listing ends with
        # ACT 5 / SCENE 2, and everything after it — the Folger introduction,
        # the editors' note, the character list — ran under that label until the
        # real Act 1 began on page 8. It has a cast, so "nobody speaks here"
        # does not catch it. What gives it away is the order: Act 5 cannot come
        # before Act 1.
        text = (
            "Contents\n\nACT 1\nSCENE 1\n\nACT 5\n\nSCENE 2\n\n"
            "From the Director of the Folger Shakespeare Library\n\n"
            "Characters in the Play\n\n"
            "GHOST\nof Hamlet, the former King of Denmark\n\n"
            "HAMLET\nPrince of Denmark, son of the late King\n\n"
            "OPHELIA\ndaughter of Polonius\n\n"
            "ROSENCRANTZ\na courtier and old school friend\n\n"
            "GUILDENSTERN\na courtier and old school friend\n\n"
            "ACT 1\n\nSCENE 1\n\nBARNARDO\nWho's there?\n\n"
            "FRANCISCO\nNay, answer me.\n\n"
            "ACT 2\n\nSCENE 1\n\nPOLONIUS\nGive him this money.\n\n"
            "REYNALDO\nI will, my lord.\n"
        )
        spans = detect_scene_spans(text)
        labels = [(s.act_label, s.scene_label) for s in spans]
        assert ("Act 5", "Scene 2") not in labels
        assert labels == [("Act 1", "Scene 1"), ("Act 2", "Scene 1")]

    def test_a_play_that_genuinely_opens_on_a_later_act_is_kept(self):
        # Sides and excerpts start wherever they start. Only a *leading* span
        # that runs backwards against the rest is front matter.
        text = (
            "ACT 3\n\nSCENE 2\n\nHAMLET\nSpeak the speech.\n\n"
            "PLAYER\nI warrant your honour.\n\n"
            "ACT 3\n\nSCENE 3\n\nKING\nO, my offence is rank.\n\n"
            "POLONIUS\nMy lord.\n"
        )
        labels = [(s.act_label, s.scene_label) for s in detect_scene_spans(text)]
        assert labels == [("Act 3", "Scene 2"), ("Act 3", "Scene 3")]

    def test_a_scene_with_a_cast_is_never_dropped(self):
        spans = detect_scene_spans(HAMLET_ISH)
        assert len(spans) == 3

    def test_a_file_that_is_all_front_matter_still_returns_something(self):
        # Dropping every span would leave nothing to pick and look like a failed
        # parse. One unpickable row beats an empty screen.
        spans = detect_scene_spans("Contents\n\nACT 1\nSCENE 1\nSCENE 2\n")
        assert len(spans) >= 1


class TestUnderSegmentation:
    """Deciding when regex probably missed something and AI should look."""

    def test_a_long_single_span_is_suspicious(self):
        text = "ANITA\nWhy can't I speak?\n" * 3000
        spans = detect_scene_spans(text)
        assert looks_under_segmented(spans) is True

    def test_a_short_unstructured_side_is_not_suspicious(self):
        # Two pages with no act headers is a side, not a mis-parsed play.
        spans = detect_scene_spans("ANITA\nWhy can't I speak?\n\nCLERK\nI'm sorry.\n")
        assert looks_under_segmented(spans) is False

    def test_a_properly_split_play_is_not_suspicious(self):
        assert looks_under_segmented(detect_scene_spans(HAMLET_ISH)) is False

    def test_one_enormous_scene_among_several_is_suspicious(self):
        # Three scenes found, but one of them is 80k characters — that one
        # almost certainly contains breaks the regex could not see.
        text = (
            "ACT I\n\nSCENE I.\n\nA\nx\n\nSCENE II.\n\n"
            + ("B\n" + "some dialogue line\n" * 4000)
            + "\nSCENE III.\n\nC\ny\n"
        )
        assert looks_under_segmented(detect_scene_spans(text)) is True


class TestPageMapping:
    """Page ranges are what let extraction parse 12 pages instead of 170."""

    def test_maps_char_offsets_back_to_pages(self):
        # Three pages of 100 characters each.
        offsets = PageOffsets([0, 100, 200], total=300)
        assert pages_for_span(offsets, 0, 50) == (1, 1)
        assert pages_for_span(offsets, 150, 160) == (2, 2)
        assert pages_for_span(offsets, 50, 250) == (1, 3)

    def test_a_span_ending_exactly_on_a_boundary_does_not_claim_the_next_page(self):
        offsets = PageOffsets([0, 100, 200], total=300)
        assert pages_for_span(offsets, 0, 100) == (1, 1)

    def test_no_page_information_yields_none(self):
        # TXT uploads have no pages. Callers must get None, not a fake page 1.
        assert pages_for_span(PageOffsets([], total=0), 0, 10) == (None, None)


class TestSelectionToPages:
    """Turning ticked scenes into the pages extraction has to read.

    This is the saving: pdfplumber over twelve pages of Hamlet, not a hundred
    and seventy.
    """

    def test_collects_the_pages_the_picked_scenes_touch(self):
        from app.services.scene_map import pages_for_selection

        picked = [
            {"page_start": 3, "page_end": 5},
            {"page_start": 40, "page_end": 41},
        ]
        assert pages_for_selection(picked) == {3, 4, 5, 40, 41}

    def test_overlapping_scenes_do_not_double_count(self):
        from app.services.scene_map import pages_for_selection

        picked = [{"page_start": 1, "page_end": 3}, {"page_start": 3, "page_end": 4}]
        assert pages_for_selection(picked) == {1, 2, 3, 4}

    def test_scenes_without_pages_yield_nothing_to_restrict_by(self):
        # A TXT upload has no pages. Returning an empty set means "no page
        # restriction", not "read no pages" — the caller must not turn that into
        # an empty script.
        from app.services.scene_map import pages_for_selection

        assert pages_for_selection([{"char_start": 0, "char_end": 10}]) == set()

    def test_a_malformed_range_is_skipped_not_crashed(self):
        from app.services.scene_map import pages_for_selection

        picked = [{"page_start": None, "page_end": 4}, {"page_start": 7, "page_end": 7}]
        assert pages_for_selection(picked) == {7}

    def test_a_backwards_range_still_yields_its_pages(self):
        from app.services.scene_map import pages_for_selection

        assert pages_for_selection([{"page_start": 9, "page_end": 6}]) == {6, 7, 8, 9}


class TestEnrichmentMerge:
    """Folding the AI's answer back in. It may add, never silently drop."""

    def test_ai_scenes_are_added_not_substituted(self):
        from app.services.scene_map import merge_ai_segmentation

        spans = detect_scene_spans(HAMLET_ISH)
        # The model claims the long second scene actually contains two.
        extra = [{"char_start": spans[1].char_start + 10, "title": "The court, later"}]
        merged = merge_ai_segmentation(spans, extra)
        assert len(merged) == len(spans) + 1
        # Still tiling, still ordered.
        for earlier, later in zip(merged, merged[1:]):
            assert earlier.char_end == later.char_start
            assert earlier.char_start < later.char_start

    def test_only_the_first_piece_keeps_the_original_title(self):
        # Split a named scene in two places and all three pieces used to come
        # back called "The court" — the same name three times in the picker,
        # with no way to tell which one you wanted.
        from app.services.scene_map import apply_ai_titles, merge_ai_segmentation

        spans = apply_ai_titles(detect_scene_spans(HAMLET_ISH), {1: "The court"})
        target = spans[1]
        merged = merge_ai_segmentation(spans, [
            {"char_start": target.char_start + 10},
            {"char_start": target.char_start + 40},
        ])
        pieces = [s for s in merged if target.char_start <= s.char_start < target.char_end]
        assert len(pieces) == 3
        assert [p.title for p in pieces] == ["The court", None, None]

    def test_a_split_point_outside_the_text_is_ignored(self):
        from app.services.scene_map import merge_ai_segmentation

        spans = detect_scene_spans(HAMLET_ISH)
        merged = merge_ai_segmentation(spans, [{"char_start": 10_000_000}])
        assert len(merged) == len(spans)

    def test_titles_attach_without_changing_the_count(self):
        from app.services.scene_map import apply_ai_titles

        spans = detect_scene_spans(HAMLET_ISH)
        titled = apply_ai_titles(spans, {0: "The guard on the platform"})
        assert len(titled) == len(spans)
        assert titled[0].title == "The guard on the platform"
        assert titled[1].title is None


class _StubClient:
    """Enough of the OpenAI client to answer one chat completion."""

    def __init__(self, content):
        self._content = content
        self.calls = 0
        outer = self

        class _Completions:
            def create(self, **kwargs):
                outer.calls += 1
                if isinstance(outer._content, Exception):
                    raise outer._content
                message = type("M", (), {"content": outer._content})
                choice = type("C", (), {"message": message})
                return type("R", (), {"choices": [choice]})

        self.chat = type("Chat", (), {"completions": _Completions()})


class TestAIEnrichment:
    """The model may add scenes and name them. It may never lose one."""

    def test_titles_and_extra_breaks_are_applied(self):
        from app.services.scene_map import enrich_with_ai

        import json

        spans = detect_scene_spans(HAMLET_ISH)
        inside = spans[1].char_start + 20
        client = _StubClient(json.dumps({"scenes": [
            {"index": 0, "title": "The guard on the platform"},
            {"index": 1, "breaks": [
                {"char_start": inside, "title": "The court, later"},
            ]},
        ]}))
        out = enrich_with_ai(spans, client)
        assert out[0].title == "The guard on the platform"
        assert len(out) == len(spans) + 1

    @pytest.mark.parametrize(
        "filler",
        [
            "Beginning of Act 1",
            "Continuation of Act 3",
            "Front Matter and Introduction",
            "Act 2",
            "Scene 4",
            "Start of the play",
            "Contents",
        ],
    )
    def test_titles_that_only_restate_the_position_are_rejected(self, filler):
        # Real Hamlet came back with "Continuation of Act 1" on four rows in a
        # row. The act and scene are already on the row; a title that repeats
        # them costs a line of space and tells you nothing about the scene.
        import json

        from app.services.scene_map import enrich_with_ai

        spans = detect_scene_spans(HAMLET_ISH)
        client = _StubClient(json.dumps({"scenes": [{"index": 0, "title": filler}]}))
        assert enrich_with_ai(spans, client)[0].title is None

    def test_a_real_title_survives(self):
        import json

        from app.services.scene_map import enrich_with_ai

        spans = detect_scene_spans(HAMLET_ISH)
        client = _StubClient(
            json.dumps({"scenes": [{"index": 0, "title": "The guard on the platform"}]})
        )
        assert enrich_with_ai(spans, client)[0].title == "The guard on the platform"

    @pytest.mark.parametrize(
        "payload",
        [
            "not json at all",
            '{"scenes": "a string, not a list"}',
            '{"nothing": "useful"}',
            "",
        ],
    )
    def test_garbage_leaves_the_regex_map_alone(self, payload):
        from app.services.scene_map import enrich_with_ai

        spans = detect_scene_spans(HAMLET_ISH)
        assert enrich_with_ai(spans, _StubClient(payload)) == spans

    def test_an_api_failure_leaves_the_regex_map_alone(self):
        from app.services.scene_map import enrich_with_ai

        spans = detect_scene_spans(HAMLET_ISH)
        out = enrich_with_ai(spans, _StubClient(RuntimeError("rate limited")))
        assert out == spans

    def test_no_client_means_no_call_and_no_change(self):
        from app.services.scene_map import enrich_with_ai

        spans = detect_scene_spans(HAMLET_ISH)
        assert enrich_with_ai(spans, None) == spans

    def test_a_well_marked_play_never_reaches_the_model(self):
        # Shakespeare costs nothing extra: regex already found every scene, so
        # looks_under_segmented is False and build_scene_map skips the call.
        from app.services.scene_map import build_scene_map

        client = _StubClient('{"scenes": []}')
        build_scene_map(HAMLET_ISH.encode("utf-8"), "txt", client=client)
        assert client.calls == 0
