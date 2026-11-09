"""Ian McWethy's monologue page: every link maps to a play with a verified year."""

from scripts.scrape_contemporary_plays import _IM_INDEX, discover_mcwethy, load_years

_PAGE = """
<p>PAIGE 1 from Molly Denholtz  <a href="https://ianmcwethy.com/wp-content/uploads/2022/05/molly-paige-mono-11.pdf" target="_blank">MOLLY – Paige – Mono 1</a></p>
<p>PAIGE 2 from Moly Denholtz  <a href="https://ianmcwethy.com/wp-content/uploads/2022/05/molly-paige-mono-21.pdf">x</a></p>
<p>GOOGLE from The Internet is Distract —  <a href="https://ianmcwethy.com/wp-content/uploads/2022/05/internet-mono-google.pdf">x</a></p>
<p>CAROL DANES from Bad Auditions by Bad Actors (Full Length Version)  <a href="https://ianmcwethy.com/wp-content/uploads/2022/05/badaudscarol_mono.pdf">x</a></p>
<p>SOMEONE from A Play Nobody Dated  <a href="https://ianmcwethy.com/wp-content/uploads/2022/05/unknown.pdf">x</a></p>
"""


def test_links_carry_the_publishers_title_and_the_character():
    links = discover_mcwethy(_IM_INDEX, _PAGE)
    assert [(l.character_name, l.label) for l in links] == [
        ("PAIGE", "The Incomplete Life & Random Death of Molly Denholtz"),
        ("PAIGE", "The Incomplete Life & Random Death of Molly Denholtz"),
        ("GOOGLE", "The Internet Is Distract--OH LOOK A KITTEN!"),
        ("CAROL DANES", "Bad Auditions by Bad Actors (full-length)"),
    ]


def test_every_mapped_play_has_a_verified_year():
    from scripts.scrape_contemporary_plays import _IM_PLAYS

    years = load_years()
    for title in set(_IM_PLAYS.values()):
        assert title.casefold() in years, title
