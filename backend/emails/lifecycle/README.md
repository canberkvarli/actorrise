# Triggered email copy

One file per touch. The file name is the touch. `backend/app/services/email/triggered.py`
reads these at send time, so editing the words here is the whole change.

**Nothing here sends until two things are true:** Canberk has read the copy, and the
"Triggered emails" switch in `/admin/emails` is on. It ships off.

## Format

```
subject: the subject line

the body, exactly as it should read.
```

Placeholders, filled per person:

| Placeholder | Becomes |
|---|---|
| `{name}` | first name, lowercase. With no name the greeting is just `hey,` |
| `{link}` | the one link, carrying `?e=<touch>` so a click is counted |
| `{span}` | the trial this person would get: `a week`, or `two weeks` once they have finished a scene |

## Rules a test holds every file to

`backend/tests/test_triggered_emails.py::CopyTests` fails the build if a file:

- has a dash (em, en) or a spaced hyphen
- says we, our or us
- has no `{link}`, or more than one
- does not end on `canberk`
- says unsubscribe anywhere in the body
- has a subject over 50 characters

## Who gets each one

| Touch | Sent | To | Not if |
|---|---|---|---|
| `checkout_abandoned` | 2 hours after `checkout_started` | anyone who started a checkout | the checkout finished |
| `paywall_seen_no_trial` | 1 day after hitting a wall | someone a free limit stopped | they started a checkout since, or have had a Stripe subscription before |

Everyone: opted in, not staff, not on the do-not-contact list, no more than 2 lifecycle
emails in 7 days, each touch once ever.

## Two decisions, both Canberk's, 2026-09-29

**Nothing is sent about a trial ending.** Two such emails were written and removed before the
switch was ever on: a heads-up before the card is charged, and a question the day after a
trial lapses. An actor on a trial hears nothing from ActorRise before or after the charge.
Stripe's three-day warning still reaches Canberk, and only Canberk.

**No reply line under the signature.** These end on `canberk`. The way out is the unsubscribe
link printed under every letter and the unsubscribe button Gmail shows beside the sender.
CLAUDE.md's reply-UNSUBSCRIBE rule still holds for every other email; these two are the
exception, and CLAUDE.md says so.

## Open question for Canberk

These carry a link straight to the in-app checkout. CLAUDE.md says a first-touch trial offer to
an individual actor closes on "reply CURTAIN". The link was chosen here because these go to
people who already reached for the button inside the app, and the in-app checkout matches the
account without a prefilled Stripe link. If CURTAIN is wanted instead, change the last paragraph
of `paywall_seen_no_trial.txt` and drop `{link}` from the test's required list for that file.
