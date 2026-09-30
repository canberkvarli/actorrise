"""scripts/voice_check.py: the voice rules in CLAUDE.md, as something that fails."""

import unittest

from scripts.voice_check import check

CLEAN_ORG = """Hi Tiffany,

Thanks for laying that out. I'm a working actor and I built ActorRise on my own.

Teachers get Plus free for a month. Send me your students' emails and I'll do the same for them.

Best,
Canberk"""

CLEAN_USER = """Hey Maya,

You've saved 16 pieces this month. Which one are you actually taking into the room?

Canberk

reply UNSUBSCRIBE and I'll take you off the list, no hard feelings"""


def broken(text, kind):
    return " | ".join(check(text, kind))


class CleanDrafts(unittest.TestCase):
    def test_they_pass(self):
        self.assertEqual(check(CLEAN_ORG, "org"), [])
        self.assertEqual(check(CLEAN_USER, "user"), [])
        self.assertEqual(check(CLEAN_ORG, "reply"), [])
        self.assertEqual(check("Ran six lines with a partner who never gets tired.", "social"), [])

    def test_html_as_the_gmail_draft_carries_it(self):
        html = "<p>Hi Om,</p><p>Send it over. It's at actorrise<span>.</span>com.</p><p>Canberk</p>"
        self.assertEqual(check(html, "reply"), [])


class EveryDraft(unittest.TestCase):
    def test_dashes(self):
        for dash in ("—", "–", " - ", " -- "):
            self.assertIn("a dash", broken(CLEAN_ORG.replace(". I'm", f"{dash}I'm"), "org"), repr(dash))

    def test_a_hyphen_inside_a_word_is_not_a_dash(self):
        self.assertEqual(check(CLEAN_ORG.replace("working actor", "self-taped actor"), "org"), [])

    def test_we(self):
        for word in ("We built", "our library", "email us", "the team", "the ActorRise team", "we're"):
            self.assertIn("first person", broken(CLEAN_ORG + f"\n{word}\nCanberk", "org"), word)

    def test_words_that_only_contain_we_or_us(self):
        text = CLEAN_ORG.replace("working actor", "working actor who uses the house and is well aware")
        self.assertEqual(check(text, "org"), [])

    def test_corporate(self):
        for phrase in ("excited to announce", "Unlock your", "a real game-changer", "I hope this email finds you well"):
            self.assertIn("corporate", broken(CLEAN_ORG.replace("Thanks", phrase), "org"), phrase)

    def test_emoji(self):
        self.assertIn("emoji", broken(CLEAN_ORG.replace("Thanks", "Thanks \U0001F3AD"), "org"))

    def test_coupons(self):
        for word in ("FOUNDER3", "a coupon", "promo code"):
            self.assertIn("coupon", broken(CLEAN_ORG.replace("Thanks", word), "org"), word)


class ByKind(unittest.TestCase):
    def test_curtain_is_for_a_first_touch_to_one_actor_only(self):
        with_curtain = CLEAN_ORG.replace("Best,", "Reply CURTAIN and I'll send the link.\n\nBest,")
        self.assertIn("CURTAIN", broken(with_curtain, "org"))
        self.assertIn("CURTAIN", broken(with_curtain, "reply"))
        user = CLEAN_USER.replace("Canberk\n", "If you want in, reply CURTAIN.\n\nCanberk\n")
        self.assertEqual(check(user, "user"), [])

    def test_the_curtain_of_a_theatre_is_fine(self):
        self.assertEqual(check(CLEAN_ORG.replace("Thanks", "The curtain goes up. Thanks"), "org"), [])

    def test_three_months_is_no_longer_the_offer(self):
        for span in ("3 months", "three months", "three-month"):
            self.assertIn("three months", broken(CLEAN_ORG.replace("a month", span), "org"), span)

    def test_a_user_email_carries_the_way_out(self):
        self.assertIn("UNSUBSCRIBE", broken(CLEAN_USER.split("\n\nreply")[0], "user"))

    def test_an_org_email_does_not_need_it(self):
        self.assertEqual(check(CLEAN_ORG, "org"), [])

    def test_a_personal_note_must_not_carry_it(self):
        note = CLEAN_USER.split("\n\nreply")[0]
        self.assertEqual(check(note, "note"), [])
        self.assertIn("opt-out line on a personal note", broken(CLEAN_USER, "note"))
        self.assertIn("CURTAIN", broken(note.replace("Canberk", "Reply CURTAIN.\n\nCanberk"), "note"))

    def test_no_url_in_anything_headed_for_gmail(self):
        for link in ("https://actorrise.com", "actorrise.com", "www.nctc.org", "buy.stripe.com/abc"):
            for kind in ("org", "user", "reply"):
                text = (CLEAN_USER if kind == "user" else CLEAN_ORG).replace("Thanks", f"See {link}. Thanks")
                text = text.replace("You've", f"See {link}. You've")
                self.assertIn("URL", broken(text, kind), f"{kind} {link}")

    def test_a_post_may_carry_a_link(self):
        self.assertEqual(check("It's live at actorrise.com", "social"), [])

    def test_the_sign_off(self):
        self.assertIn("sign off", broken(CLEAN_ORG.replace("Canberk", "The ActorRise Team"), "org"))
        self.assertIn("sign off", broken(CLEAN_ORG.rsplit("Best,", 1)[0], "org"))

    def test_unknown_kind(self):
        with self.assertRaises(ValueError):
            check("x", "tweet")


if __name__ == "__main__":
    unittest.main()
