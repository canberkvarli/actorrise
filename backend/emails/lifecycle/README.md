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
| `{date}` | `trial_ending` only: the day the card is charged, e.g. `thursday, october 1` |
| `{amount}` | `trial_ending` only: what is charged, `$12` or `$99` |
| `{every}` | `trial_ending` only: `month` or `year` |

## Rules a test holds every file to

`backend/tests/test_triggered_emails.py::CopyTests` fails the build if a file:

- has a dash (em, en) or a spaced hyphen
- says we, our or us
- has no `{link}`, or more than one
- is missing the line `reply unsubscribe and i'll take you off the list, no hard feelings.`
- does not sign off `canberk`
- has a subject over 50 characters

## Who gets each one

| Touch | Sent | To | Not if |
|---|---|---|---|
| `trial_ending` | 1 to 3 days before the card is charged | everyone on a Stripe trial | they already cancelled |
| `checkout_abandoned` | 2 hours after `checkout_started` | anyone who started a checkout | the checkout finished |
| `trial_ended_no_pay` | 1 day after the trial ended | a Stripe trial that did not convert | they are paying now |
| `paywall_seen_no_trial` | 1 day after hitting a wall | someone a free limit stopped | they started a checkout since, or have had a Stripe subscription before |

Everyone: opted in, not staff, not on the do-not-contact list, no more than 2 lifecycle
emails in 7 days, each touch once ever.

`trial_ending` is the exception, because it is a notice about a charge and not an ask. It
goes whether or not the person opted in to marketing, and the weekly cap cannot hold it
back. Someone who asked to be left alone, or whose address bounced, still does not get it.

## Open question for Canberk

These carry a link straight to the in-app checkout. CLAUDE.md says a first-touch trial offer to
an individual actor closes on "reply CURTAIN". The link was chosen here because these go to
people who already reached for the button inside the app, and the in-app checkout matches the
account without a prefilled Stripe link. If CURTAIN is wanted instead, change the last paragraph
of `paywall_seen_no_trial.txt` and drop `{link}` from the test's required list for that file.
