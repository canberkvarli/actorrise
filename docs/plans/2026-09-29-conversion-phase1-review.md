# Conversion Phase 1 spec, checked against prod and the code

Checked 2026-09-29. Spec: `~/Downloads/actorrise-conversion-phase1.md`.
Prod reads were SELECT only, read-only transaction, project `ppvqmbzuqvzpiuqaiqfy`
(matches `backend/.env`). "Real" means `exclude_from_stats` dropped. "Free" means
no active or trialing paid subscription.

Nothing was built. This is a review of the spec only.

## 1. The baseline counts are right, the window is wrong

Every number in the "Why" section matches prod exactly:

| event | rows 30d | distinct users | first row in user_events |
|---|---|---|---|
| signup_completed | 396 | 391 | 2026-09-06 |
| first_search_submitted | 256 | 252 | 2026-09-06 |
| onboarding_completed | 200 | 198 | 2026-09-06 |
| monologue_work_started | 140 | 91 | 2026-09-07 |
| upgrade_modal_viewed | 24 | **4** | **2026-09-27** |
| trial_offer_shown | 7 | 7 | **2026-09-27** |
| checkout_started | 1 | 1 | **2026-09-28** |
| trial_ended | 2 | 2 | 2026-09-15 |
| trial_converted | 1 | 1 | 2026-09-17 |

The three money events only started writing to `user_events` on 2026-09-27
(31bfe793). So "24 in the last 30 days" is 24 in about two and a half days.

- `upgrade_modal_viewed` by feature: monologue_read 10 rows from **1 user**,
  monologue_read_panel 8 rows from **1 user**, monologue_rehearsal 3 (2 users),
  AI Voice 2 (1), ScenePartner 1 (1). "18 of 24" is two people refreshing.
- At the current rate the existing walls already produce roughly 290 rows a
  month with no change. The goal "24 to 100+ per month" is met by waiting.
- In distinct users the current rate is about 4 per 2.5 days, so roughly 50 a
  month. That is the real baseline.
- The Phase 2 gate is written in distinct users (100+), the goal is written in
  rows. Pick one. Distinct users is the honest one.

**Fix:** restate the goal as distinct users per 30 days, and either wait for a
full window (2026-10-27) or use a per-day rate from 2026-09-27 on.

## 2. "trial_ended fired twice, no email went out"

Both rows are `outcome: converted` (users 2127 and 1939). There has never been a
no-pay trial end in the data, so there was nothing for a `trial_ended_no_pay`
email to do. Two more things:

- User 2127 has `trial_ended: converted` but no `trial_converted` row. Only 1939
  has both. `funnel_daily.paid` reads `trial_converted`, so it would undercount.
  Worth finding out why before trusting that column.
- ~~Trial emails already exist, so the spec's `trial_ending` would be a second
  email about the same thing.~~ **Wrong, corrected the same day.**
  `send_trial_ending_notification` and `send_trial_ended_notification` both
  send to the founder, not the actor. The spec was right to ask for
  `trial_ending`, and it has been built.

## 3. Conflicts with what is shipped

**Trial length.** Spec says 7 days, "already decided". Everything live says 14:
`subscriptions.py:263` (`trial_period_days = 14`), the Stripe link
`00w8wR4Xqd7o7JGa3X6g802`, and the "2 weeks free" copy rule in CLAUDE.md. No
record of a 7-day decision in `docs/metrics/decisions.md` or `docs/plans/`.
If 7 is right it touches the backend constant, the Stripe link, CLAUDE.md and
every email that says two weeks.

**Free tier.** The spec describes a different free tier from the one running:

| | spec | shipped |
|---|---|---|
| reading | first N lines of any monologue | 5 full reads a month (web), 3 (Ghostlight) |
| saves | 3 | unlimited, no cap anywhere in the code |
| rehearsal | 1 session a week | ScenePartner 3 a month + 1 script; monologue work on a 14-day reverse trial |
| cut editor, notes | paid | free |

So Step 2 is a pricing change, not only placement. The spec also does not say
whether `rehearsal_limit` means ScenePartner (`rehearsal_sessions`) or monologue
work, which are metered separately today.

**"Inline card" vs the redesign.** The spec says do not touch the redesign and
also asks for an inline card. `MonologueWall` was deliberately built as not a
card (ff7b7629). The existing offer cooldown lives in localStorage
(`useTrialOffer`); the spec wants it server side, which is a rewrite of that hook.

## 4. What each gate would actually catch

Real free users, last 30 days:

| gate | who would hit it | note |
|---|---|---|
| read_full | 39 users read 5+ pieces this month, 25 read 6+ | exists today |
| save_limit | 75 users made a 4th+ save | **82 users already hold 4+ saves**, 97 hold 3+ |
| rehearsal_limit | 3 users started a 2nd session inside 7 days | of 38 with any session |
| cut_editor | 8 users opened it | |
| notes | 9 users focused it | |
| scene_completed | 5 users | exists today |

- Volume comes from two gates, `read_full` and `save_limit`. The other four add
  about 25 users between them.
- `save_limit` needs a rule for the 82 people already over the line.
- Saving is the one behaviour tied to coming back, and the day-1 reminder and
  both lifecycle anchors are built on favorites. Capping it at 3 trades the
  retention signal for paywall volume. This is the biggest judgement call in
  the spec.
- Cut editor and notes are nearly undiscovered (8 and 9 people). Walling them
  hides features almost nobody has found yet.

## 5. Things in the spec that will break as written

- **`touch` is `varchar(16)`.** `trial_ended_no_pay` (18), `checkout_abandoned`
  (18) and `paywall_seen_no_trial` (21) do not fit. Needs a migration or shorter
  names.
- **`UNIQUE(user_id, touch)`** on `lifecycle_email_sends` means `dormant_book`
  can only ever send once per user, not once per 30 days.
- **The lifecycle selector is signup-anchored** (`TOUCHES` = hours after signup).
  Event-anchored touches are a new selector, not an extension of the dict.
- **The event vocabulary is closed** (`services/events.py`). A name not in
  `EVENT_NAMES` is a silent no-op. Missing today: `paywall_hit`,
  `paywall_dismissed`, `paywall_cta_clicked`, `trial_started` (GA4 only),
  `checkout_completed` (a handler name, not an event), `checkout_abandoned`,
  `email_sent`, `email_clicked`. `surface` is only on `cut_editor_opened`.
- **`funnel_daily`** as written: a view in `public` is served by the Supabase
  API and runs with the owner's rights, which steps around the 2026-08-23 RLS
  lockdown. Create it `with (security_invoker = true)` and revoke anon and
  authenticated, or keep it out of `public`. It also counts staff, mixes
  `count(*)` with `count(distinct)`, and buckets days in UTC.
- **39 subscriptions are `trialing`, 34 of them manual comps** with no Stripe
  subscription. Only 5 are real Stripe trials. Any touch keyed on "trialing"
  status instead of the Stripe events would email comped educators and students.

## 6. Email rules the spec leaves out

- CLAUDE.md requires the reply line in every email to current users:
  "reply UNSUBSCRIBE and I'll take you off the list, no hard feelings", plus the
  unsubscribe link. The spec's copy rules ("one link") do not mention either.
  Applies to all 7 touches and both founder emails.
- Email has not moved anyone so far. day3 and day10 have sent 681 (333 + 348).
  At the 2026-09-20 read, 1 of 320 recipients came back. The note written when
  they shipped says not to add a third touch before the first two show a return.
- The three money touches (`trial_ending`, `trial_ended_no_pay`,
  `checkout_abandoned`) are reasonable but tiny: 5 Stripe trials and 1 checkout
  exist. The four behaviour touches go to the same people who ignored day3 and
  day10.

## 7. Step 4 is fine, with two notes

- Heavy pool: 343 real free opted-in users active in 30 days, 144 with a score
  of 5+, 44 with 10+. Top 30 is easy to fill.
- Bounced pool: 202 users. **183 of them already got day3 or day10** and did not
  come back, so the founder email is their third touch.
- `outreach/` is not gitignored. The CSVs carry user emails. Ignore
  `outreach/founder/` before generating them.
- "$12" matches Plus monthly.

## Decisions needed before a plan can be written

1. Trial: 7 days or 14?
2. Free tier: is capping saves at 3 and gating cut editor and notes intended, as
   a pricing change? What happens to the 82 users already over 3 saves?
3. Goal unit: distinct users or rows, and from which start date?
4. Emails: all 7 touches, or the money ones first?
