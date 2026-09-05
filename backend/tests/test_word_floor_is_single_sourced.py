"""The word floor must exist in exactly one place.

The floor has moved twice: 40 -> 75 -> 100. Each time, `DEFAULT_MIN_WORDS`
changed and eight parsers carrying their own `min_words: int = 75` did not, so
the new floor applied to whatever imported the constant and the old one quietly
stayed in force everywhere else.

That is the same shape as two bugs already in this codebase's history: the
review-status gate applied on one of five search paths, and the fingerprint
computed differently in Python and in SQL. A rule with two copies is a rule
that will disagree with itself.

So this scans the source. It is not elegant, but a value that must not be
duplicated cannot be defended by a test that only checks one caller.
"""

import pathlib
import re
import unittest

from app.services.extraction.monologue_quality import DEFAULT_MIN_WORDS

BACKEND = pathlib.Path(__file__).resolve().parent.parent
SEARCH_DIRS = ["app", "scripts"]

#: A default that sets the floor, e.g. `min_words: int = 75` or `min_words=40`.
_LITERAL_FLOOR = re.compile(r"min_words(?:\s*:\s*int)?\s*=\s*(\d+)")


def _python_files():
    for d in SEARCH_DIRS:
        for path in (BACKEND / d).rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            yield path


class WordFloorTests(unittest.TestCase):
    def test_the_floor_is_one_hundred(self):
        """Canberk's call: under ~100 words is not an audition piece."""
        self.assertEqual(DEFAULT_MIN_WORDS, 100)

    def test_no_parser_hardcodes_its_own_floor(self):
        """Every caller must inherit the constant, not restate a number.

        Tests may pass an explicit floor -- they are testing the artifact, not
        the policy -- so only app/ and scripts/ are scanned.
        """
        offenders = []
        for path in _python_files():
            for line_no, line in enumerate(path.read_text().splitlines(), 1):
                if line.lstrip().startswith("#"):
                    continue
                for match in _LITERAL_FLOOR.finditer(line):
                    offenders.append(
                        f"{path.relative_to(BACKEND)}:{line_no}: "
                        f"min_words={match.group(1)} -- use DEFAULT_MIN_WORDS"
                    )
        self.assertEqual(offenders, [], "\n" + "\n".join(offenders))

    def test_the_extraction_parsers_actually_default_to_it(self):
        """A parser importing the constant but ignoring it is no better."""
        import inspect

        from app.services.extraction.plain_text_parser import PlainTextParser
        from app.services.extraction.screenplay_pdf_parser import segment_screenplay

        checks = [
            ("PlainTextParser.extract_monologues",
             inspect.signature(PlainTextParser.extract_monologues)),
            ("segment_screenplay", inspect.signature(segment_screenplay)),
        ]
        for name, sig in checks:
            self.assertEqual(
                sig.parameters["min_words"].default, DEFAULT_MIN_WORDS,
                f"{name} does not default to DEFAULT_MIN_WORDS",
            )


if __name__ == "__main__":
    unittest.main()
