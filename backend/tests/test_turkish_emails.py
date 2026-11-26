"""The automatic emails in Turkish for an actor whose UI is Turkish.

Every email here renders twice: lang="tr" must read Turkish all the way
through (no dashes, no English sentence left behind, a Turkish footer), and
lang="en" must stay exactly what it was before Turkish existed.
"""

import re
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.audition import Audition
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.lifecycle_email import LifecycleEmailSend
from app.models.organization import Organization
from app.models.user import User
from app.services.auditions import reminders
from app.services.email import lifecycle, triggered
from app.services.email.templates import TR_REPLY_OUT, EmailTemplates, lower_name
from tests.dbfixture import memory_db, restore

DASHES = re.compile(r"[‒–—―]| - ")
# Sentences the English versions say. None of them may survive in Turkish.
ENGLISH = re.compile(
    r"\b(hey|you|your|the|and|it's|i'll|reply|unsubscribe|saved|search|tomorrow|"
    r"didn't mean|undo it|no hard feelings|break a leg)\b",
    re.I,
)
ANCHORS = [
    {"anchor": "favorite", "character": "Hamlet", "play": "Hamlet", "link": "https://x/monologue/7"},
    {"anchor": "search", "query": "dramatik", "link": "https://x/monologues"},
    {"anchor": "none", "link": "https://x/monologues"},
]


def _visible(html: str) -> str:
    """The words a reader sees: tags, attributes and style blocks stripped."""
    html = re.sub(r"<style.*?</style>", " ", html, flags=re.S)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    return re.sub(r"<[^>]+>", " ", html)


class TurkishCase(unittest.TestCase):
    def assertTurkish(self, text: str, phrase: str, where=None):
        self.assertIn(phrase, text, where)
        self.assertIsNone(DASHES.search(text), (where, text))
        self.assertIsNone(ENGLISH.search(text), (where, ENGLISH.search(text) and ENGLISH.search(text).group(0)))
        self.assertNotRegex(text, r"\{[a-z_]+\}", where)

    def assertTurkishHtml(self, html: str, phrase: str, where=None):
        self.assertIn('<html lang="tr">', html, where)
        self.assertIn("buradan çık", html, where)  # base_personal's Turkish footer
        self.assertTurkish(_visible(html), phrase, where)


class LifecycleTests(TurkishCase):
    def setUp(self):
        self.tpl = EmailTemplates()

    def test_every_anchor_both_touches_in_turkish(self):
        phrases = {
            ("day3", "favorite"): "monoloğunu kaydettin",
            ("day3", "search"): "bir monolog bulabildin mi",
            ("day3", "none"): "henüz hiç arama yapmadın",
            ("day10", "favorite"): "monoloğu hâlâ kayıtlı",
            ("day10", "search"): "kütüphane de ",
            ("day10", "none"): "arama da",
        }
        for touch in lifecycle.TOUCHES:
            for anchor in ANCHORS:
                for name in ("Işıl Kaya", None):
                    person = {"touch": touch, "user_name": name, "lang": "tr", **anchor}
                    subject, html, plain = lifecycle.render(self.tpl, person, "https://x/unsub")
                    where = (touch, anchor["anchor"], name)
                    phrase = phrases[(touch, anchor["anchor"])]
                    self.assertTurkish(subject, "", where)
                    self.assertTurkish(plain, phrase, where)
                    self.assertTurkishHtml(html, phrase, where)
                    self.assertIn(anchor["link"], plain)
                    self.assertIn(f'href="{anchor["link"]}"', html)
                    self.assertIn(TR_REPLY_OUT, plain)
                    self.assertIn(TR_REPLY_OUT, html)
                    self.assertTrue(plain.startswith("selam ışıl,\n" if name else "selam,\n"), where)

    def test_turkish_subjects(self):
        fav = {"touch": "day3", "lang": "tr", **ANCHORS[0]}
        self.assertEqual(lifecycle.render(self.tpl, fav, None)[0], "Hamlet monoloğunu prova ettin mi?")
        self.assertEqual(lifecycle.render(self.tpl, {**fav, "touch": "day10"}, None)[0], "tek bir soru")

    def test_english_is_unchanged(self):
        fav = {"touch": "day3", "user_name": "Maya Lopez", **ANCHORS[0]}
        for person in (fav, {**fav, "lang": "en"}):
            subject, html, plain = lifecycle.render(self.tpl, person, None)
            self.assertEqual(subject, "have you run Hamlet yet?")
            self.assertTrue(plain.startswith("hey maya,\n\nyou saved Hamlet from Hamlet a few days ago."))
            self.assertTrue(plain.endswith("reply unsubscribe and i'll take you off, no worries."))
            self.assertIn('<html lang="en">', html)
            self.assertNotIn("selam", html)


class LifecycleSelectTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, EmailDoNotContact, LifecycleEmailSend])
        self.patches = [
            mock.patch.object(lifecycle, "_paid_user_ids", lambda db: set()),
            mock.patch.object(lifecycle, "_active_since", lambda db, uid, since: False),
            mock.patch.object(lifecycle, "_favorite_anchor", lambda db, uid: {
                "anchor": "favorite", "character": "that character", "play": "Hamlet", "link": "L"}),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        restore(self.saved)

    def test_language_comes_from_the_user_row(self):
        created = datetime.now(timezone.utc) - timedelta(hours=80)
        for email, lang in (("tr@x.com", "tr"), ("en@x.com", "en"), ("none@x.com", None)):
            self.db.add(User(email=email, supabase_id=email, marketing_opt_in=True, created_at=created,
                             ui_language=lang))
        self.db.commit()
        got = {p["email"]: p for p in lifecycle.select_candidates(self.db, "day3")}
        self.assertEqual(got["tr@x.com"]["lang"], "tr")
        self.assertEqual(got["tr@x.com"]["character"], "o karakter")
        self.assertEqual(got["en@x.com"]["lang"], "en")
        self.assertEqual(got["none@x.com"]["lang"], "en")
        self.assertEqual(got["none@x.com"]["character"], "that character")


class SavedPieceTests(TurkishCase):
    def test_turkish(self):
        tpl = EmailTemplates()
        for name in ("İpek Yılmaz", None):
            html = tpl.render_saved_piece_reminder("Hamlet", "Hamlet", "https://x/m/7", name,
                                                   unsubscribe_url="https://x/unsub", lang="tr")
            plain = tpl.render_saved_piece_reminder_plain("Hamlet", "Hamlet", "https://x/m/7", name, lang="tr")
            self.assertTurkishHtml(html, "bir daha dönmedin", name)
            self.assertTurkish(plain, "bir daha dönmedin", name)
            self.assertIn("https://x/m/7", plain)
            self.assertIn(TR_REPLY_OUT, plain)
            self.assertTrue(plain.startswith("selam ipek,\n" if name else "selam,\n"))
        from app.services.email.saved_piece_reminder import SUBJECT_TR
        self.assertTurkish(SUBJECT_TR.format(character="Hamlet"), "kaydettin")

    def test_english_is_unchanged(self):
        tpl = EmailTemplates()
        html = tpl.render_saved_piece_reminder("Viola", "Twelfth Night", "https://x/m/7", "Maya", unsubscribe_url="u")
        plain = tpl.render_saved_piece_reminder_plain("Viola", "Twelfth Night", "https://x/m/7", "Maya")
        self.assertIn("you saved Viola from Twelfth Night a few days ago", html)
        self.assertTrue(plain.startswith("hey maya,\n"))
        self.assertIn('<html lang="en">', html)


class TriggeredTests(TurkishCase):
    def person(self, touch, **kw):
        return {"touch": touch, "user_name": "Işıl", "link": "https://x/trial?e=" + touch,
                "span": "3 gün", "lang": "tr", **kw}

    def test_every_touch_has_turkish_copy(self):
        files = {p.stem for p in (triggered.COPY_DIR / "tr").glob("*.txt")}
        self.assertEqual(files, set(triggered.TRIGGERS))

    def test_turkish(self):
        phrases = {"checkout_abandoned": "kart adımında", "paywall_seen_no_trial": "ücretsiz limite takıldın"}
        for touch in triggered.TRIGGERS:
            for name in ("Işıl", None):
                subject, html, plain = triggered.render(self.person(touch, user_name=name), "https://x/unsub")
                self.assertTurkish(subject, "", touch)
                self.assertTurkish(plain, phrases[touch], touch)
                self.assertTurkishHtml(html, phrases[touch], touch)
                self.assertIn("3 gün", plain)
                self.assertIn("https://x/trial?e=" + touch, plain)
                self.assertTrue(plain.rstrip().endswith("\ncanberk"))
                self.assertNotIn("ÇIK", plain)  # no reply line on these, same as English
                self.assertTrue(plain.startswith("selam ışıl,\n" if name else "selam,\n"))
        _, _, plain = triggered.render(self.person("paywall_seen_no_trial"), None)
        self.assertIn("Ghost Light’ta", plain)

    def test_turkish_span(self):
        for days, words in ((3, "3 gün"), (7, "bir hafta"), (14, "iki hafta"), (1, "bir gün")):
            with mock.patch("app.services.trial_length.trial_days_for", lambda db, uid, d=days: d):
                self.assertEqual(triggered.trial_span_for(None, 1, "tr"), words)
        with mock.patch("app.services.trial_length.trial_days_for", lambda db, uid: 3):
            self.assertEqual(triggered.trial_span_for(None, 1), "3 days")

    def test_english_is_unchanged(self):
        person = self.person("checkout_abandoned", span="3 days", user_name="Maya")
        for p in ({k: v for k, v in person.items() if k != "lang"}, {**person, "lang": "en"}):
            subject, html, plain = triggered.render(p, "https://x/unsub")
            self.assertEqual(subject, "did something go wrong?")
            self.assertTrue(plain.startswith("hey maya,\n\nyou started the plus trial"))
            self.assertIn('<html lang="en">', html)


def utc(y, mo, d, h, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


def aud(**kw):
    base = dict(id=1, user_id=1, project="Martı", role="Nina", kind="in_person", status="scheduled",
                tz="Europe/Istanbul", reminders_on=True, outcome_token="tok",
                created_at=utc(2026, 9, 30, 12), starts_at=utc(2026, 10, 9, 11, 40))  # Fri 14:40 Istanbul
    base.update(kw)
    return Audition(**base)


class AuditionTests(TurkishCase):
    def test_every_moment_has_turkish_copy(self):
        files = {p.stem for p in (reminders.COPY_DIR / "tr").glob("*.txt")}
        self.assertEqual(files, set(reminders.MOMENTS))

    def test_turkish(self):
        phrases = {"prep": "bir gece önce", "eve": "bol şans", "after": "nasıl geçti"}
        cases = [
            aud(),
            aud(kind="self_tape", starts_at=None, due_at=utc(2026, 10, 12, 14, 0), role=None),
            aud(user_script_id=4, material_raw="1 dakikalık çağdaş", location="Kadıköy", bring="vesikalık"),
            aud(material_raw="1 dakikalık çağdaş bir monolog"),
        ]
        for a in cases:
            for moment in reminders.MOMENTS:
                for runs in (0, 1, 3):
                    for name in ("Işıl", None):
                        subject, html, plain = reminders.render(
                            a, moment, name, runs=runs, unsubscribe_url="https://x/unsub",
                            now=utc(2026, 10, 6, 15, 0), lang="tr")
                        where = (a.kind, moment, runs, name)
                        self.assertTurkish(subject, "", where)
                        self.assertTurkish(plain + subject, phrases[moment], where)
                        self.assertTurkishHtml(html, "canberk", where)
                        self.assertTrue(plain.rstrip().endswith("\ncanberk"), where)
                        self.assertTrue(plain.startswith("selam ışıl,\n" if name else "selam,\n"), where)

    def test_turkish_dates_and_clock(self):
        _, _, plain = reminders.render(aud(), "prep", "Işıl", runs=0, unsubscribe_url=None,
                                       now=utc(2026, 10, 6, 15, 0), lang="tr")
        self.assertIn("Martı (Nina) için seçme Cuma günü, saat 14.40.", plain)
        subject, _, _ = reminders.render(aud(), "prep", "Işıl", runs=0, unsubscribe_url=None,
                                         now=utc(2026, 10, 6, 15, 0), lang="tr")
        self.assertEqual(subject, "Martı: 3 gün sonra")
        _, _, plain = reminders.render(aud(location="Kadıköy"), "eve", "Işıl", runs=0, unsubscribe_url=None,
                                       lang="tr")
        self.assertIn("yarın, saat 14.40, Kadıköy.", plain)
        tape = aud(kind="self_tape", starts_at=None, due_at=utc(2026, 10, 12, 14, 0), user_script_id=4)
        _, _, plain = reminders.render(tape, "eve", "Işıl", runs=3, unsubscribe_url=None, lang="tr")
        self.assertIn("self tape teslimi yarın, saat 17.00.", plain)
        self.assertIn("3 kez çalıştın.", plain)

    def test_english_is_unchanged(self):
        en = reminders.render(aud(), "prep", "Maya", runs=0, unsubscribe_url=None, now=utc(2026, 10, 6, 15, 0))
        self.assertEqual(en, reminders.render(aud(), "prep", "Maya", runs=0, unsubscribe_url=None,
                                              now=utc(2026, 10, 6, 15, 0), lang="en"))
        self.assertEqual(en[0], "Martı is in 3 days")
        self.assertTrue(en[2].startswith("hey maya,\n\nMartı (Nina) is Friday at 2:40 pm."))


class LowerNameTests(unittest.TestCase):
    def test_turkish_i(self):
        self.assertEqual(lower_name("Işıl", "tr"), "ışıl")
        self.assertEqual(lower_name("İpek", "tr"), "ipek")
        self.assertEqual(lower_name("Maya"), "maya")


if __name__ == "__main__":
    unittest.main()
