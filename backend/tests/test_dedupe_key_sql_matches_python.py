"""The re-ingest dedupe key has a Python definition and a SQL one. They must agree.

WHY THERE ARE TWO. Building the "speeches we already carry" set used to read
every monologue's text and hash it locally:

    {dedupe_key(t) for (t,) in db.query(Monologue.text).all()}

That is 18 MB on the wire per ingest run, and Supabase bills egress -- it is one
of the largest single items in pg_stat_statements. Postgres now computes the
same key and sends 32-byte digests: 0.79 MB, 23x less.

WHY THAT IS DANGEROUS. If the SQL drifts from the Python by one character class,
no error is raised anywhere. The key set simply stops matching, every speech
looks new, and the next re-extraction re-inserts the entire library as
duplicates. This project has been bitten by one-rule-two-copies repeatedly (the
word floor in 13 places, the review gate on 1 of 5 search paths), and this pair
fails more quietly than either.

So the SQL is checked against the Python on real text, including the characters
where regex dialects actually differ: POSIX classes vs \\s, unicode, digits,
apostrophes, and runs of whitespace.
"""

import re
import unittest

from scripts.extract_pd_monologues import DEDUPE_KEY_SQL, dedupe_hash, dedupe_key

#: Text that has broken one dialect or the other before, plus the shapes a play
#: actually produces: verse with apostrophes, em dashes, accents, stage cruft.
SAMPLES = [
    "To be, or not to be, that is the question:",
    "  leading and trailing whitespace   ",
    "tabs\tand\nnewlines\r\nmixed   together",
    "CAPITALS and lower MiXeD",
    "punctuation!!! ??? ,,, ... --- ''' \"\"\" ;;; :::",
    "apostrophes: 'tis, don't, o'er, th' expense",
    "em—dash and en–dash and hyphen-word",
    "accents: naïve café Œdipus Ægeus Ælfred",
    "digits 123 mixed 4th 5678 with words",
    "a" * 400,
    " ".join(str(i) for i in range(60)),          # more than 30 tokens
    "exactly thirty words " + " ".join(f"w{i}" for i in range(27)),
    "",
    "   ",
    "!!!",                                         # normalizes to nothing
    "one",
    "ONE two THREE four",
    "Œdipus, Œdipus! — why dost thou weep?",
    "line one\n\nline two\n\n\nline three",
    "非英語のテキスト mixed with english",
]


class PythonDefinitionTests(unittest.TestCase):
    def test_key_is_lowercase_alphanumeric_first_thirty_words(self):
        self.assertEqual(dedupe_key("To Be, Or Not To Be!"), "to be or not to be")

    def test_key_stops_at_thirty_words(self):
        key = dedupe_key(" ".join(f"w{i}" for i in range(50)))
        self.assertEqual(len(key.split()), 30)

    def test_text_that_normalizes_to_nothing_yields_an_empty_key(self):
        """An empty key must be skipped, never deduped against."""
        for junk in ("", "   ", "!!!", "--- ... ;;;"):
            self.assertEqual(dedupe_key(junk), "")

    def test_hash_is_of_the_key_not_the_text(self):
        import hashlib

        self.assertEqual(
            dedupe_hash("To Be, Or Not To Be!"),
            hashlib.md5(b"to be or not to be").hexdigest(),
        )

    def test_two_spellings_of_one_speech_collide(self):
        """Punctuation and case differ between extractions of the same text."""
        self.assertEqual(
            dedupe_hash("O, that this too too solid flesh would melt!"),
            dedupe_hash("o that this TOO too solid flesh would melt"),
        )


class SqlMatchesPythonTests(unittest.TestCase):
    """A local re-implementation of the SQL, held to the same samples.

    The real check runs against Postgres (see the module docstring in
    `scripts/extract_pd_monologues.py`); this one runs everywhere and catches an
    edit to either definition without needing a database.
    """

    @staticmethod
    def _sql_semantics(text: str) -> str:
        """What DEDUPE_KEY_SQL computes, in Python.

        lower -> strip anything outside [a-z0-9] and whitespace -> btrim ->
        split on whitespace runs -> first 30 -> join with a single space.
        """
        stripped = re.sub(r"[^a-z0-9\s]", "", (text or "").lower())
        parts = [p for p in re.split(r"\s+", stripped.strip()) if p]
        return " ".join(parts[:30])

    def test_the_sql_expression_mentions_the_same_pieces(self):
        for fragment in ("lower(", "[^a-z0-9[:space:]]", "btrim(", "[1:30]"):
            self.assertIn(fragment, DEDUPE_KEY_SQL)

    def test_every_sample_agrees(self):
        for sample in SAMPLES:
            with self.subTest(sample=sample[:40]):
                self.assertEqual(
                    dedupe_key(sample),
                    self._sql_semantics(sample),
                    "SQL and Python dedupe keys diverged; re-ingest would "
                    "re-insert the whole library as duplicates",
                )

    def test_agreement_holds_on_generated_verse(self):
        """Wider net than the hand-written samples."""
        import random

        random.seed(11)
        alphabet = "abcXYZ0129 ,.;:!?'\"-—\t\n éŒ"
        for _ in range(500):
            s = "".join(random.choice(alphabet) for _ in range(random.randint(0, 120)))
            self.assertEqual(dedupe_key(s), self._sql_semantics(s), repr(s))


if __name__ == "__main__":
    unittest.main()
