"""The scene shelf's cutter: two people talking, cut and cut again the same way."""

from app.services.extraction import scene_cutter as sc

LINE_A = "I have been waiting for you all evening and you know it very well indeed."
LINE_B = "Then you should have gone home, because I was never going to come tonight."


def _exchange(a, b, n):
    out = []
    for i in range(n):
        out.append(f"{a}. {LINE_A} Number {i}.\n")
        out.append(f"{b}. {LINE_B} Number {i}.\n")
    return "\n".join(out)


def _play(body):
    # The cast must recur for Title Case cues to count; the exchange does that.
    return "THE PLAY\n\nACT I\n\n" + body


def test_two_people_talking_is_a_scene():
    text = _play(_exchange("Nora", "Helmer", 6))
    found = sc.cut_play(text)
    assert len(found) == 1
    scene = found[0]
    assert {scene.character_1, scene.character_2} == {"Nora", "Helmer"}
    assert scene.turns == 12
    assert sc.MIN_SECONDS <= scene.duration_seconds <= sc.MAX_SECONDS


def test_lines_come_back_from_the_offsets_alone():
    text = _play(_exchange("Nora", "Helmer", 6))
    scene = sc.cut_play(text)[0]
    assert sc.lines_between(text, scene.start, scene.end) == scene.lines
    assert scene.lines[0]["text"].startswith("I have been waiting")


def test_a_third_speaker_ends_the_stretch():
    text = _play(
        _exchange("Nora", "Helmer", 6)
        + "\nRank. Good evening to you both, I hope I am not interrupting anything at all.\n\n"
        + _exchange("Rank", "Nora", 5)  # a cue has to recur to count as one
    )
    found = sc.cut_play(text)
    assert {found[0].character_1, found[0].character_2} == {"Nora", "Helmer"}
    # The speech just before the newcomer is dropped: it is usually to them.
    assert found[0].turns == 11


def test_an_exit_ends_the_stretch():
    first = _exchange("Nora", "Helmer", 3).replace(
        f"Helmer. {LINE_B} Number 2.", f"Helmer. {LINE_B} Number 2. [Exit.]"
    )
    text = _play(first + "\n" + _exchange("Nora", "Helmer", 3))
    # Each half is 6 speeches, under MIN_TURNS, so nothing survives the split.
    assert sc.cut_play(text) == []


def test_a_lopsided_stretch_is_not_a_scene():
    long = " ".join([LINE_A] * 6)
    body = "\n".join(f"Nora. {long} {i}.\n\nHelmer. Yes {i}.\n" for i in range(6))
    assert sc.cut_play(_play(body)) == []


def test_too_short_is_not_a_scene():
    assert sc.cut_play(_play(_exchange("Nora", "Helmer", 2))) == []


def test_a_long_stretch_is_cut_into_pieces():
    text = _play(_exchange("Nora", "Helmer", 30))
    found = sc.cut_play(text)
    assert len(found) >= 2
    assert all(s.duration_seconds <= sc.MAX_SECONDS for s in found)
    assert all(a.end <= b.start for a, b in zip(found, found[1:]))


def test_the_chorus_is_not_a_scene_partner():
    assert sc.cut_play(_play(_exchange("Chorus", "Helmer", 6))) == []


def test_html_is_read_as_text():
    html = "<html><body><p>" + _play(_exchange("Nora", "Helmer", 6)).replace("\n", "<br>\n") + "</p></body></html>"
    text = sc.play_text(html, "html")
    assert "<p>" not in text
    assert sc.cut_play(text)


def test_span_hash_changes_with_the_text():
    assert sc.span_hash("abcdef", 0, 3) != sc.span_hash("abXdef", 0, 3)
