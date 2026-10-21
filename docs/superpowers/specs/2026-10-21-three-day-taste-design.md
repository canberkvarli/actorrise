# Three-day taste at the read wall

Date: 2026-10-21. Approved in conversation by Canberk.

## Why

Over the last 30 days, among real users only:

- 276 people opened a monologue. 145 of them opened just one, and 49 opened 5 or more.
  Five is the free limit, so those 49 are the people who reach the wall.
- 7 people started a checkout, and 1 completed it. Of the 9 real Stripe sessions,
  8 were abandoned at the card form.
- 5 of the 6 web payers use only the library. The Ghost Light app is monologues only. It
  starts about 7 trials a week, because Apple's trial is one tap.

So the money is in the library, and the card form is the leak. The plan is to give the people
who want more a taste of Plus with no card, and then ask them to pay.

## What the actor sees

1. **Reads 1 to 5 in a month:** no change. The meter counts down the 5 free reads.
2. **The read that would hit the wall:** if the user is eligible, the piece opens in full and
   they get **3 days (72 hours) of Plus with no card**.
   - A one-time banner says: "You've been busy. Here's 3 days of everything, on me. No card."
   - The reads meter becomes a countdown: "Plus · 2 days left".
3. **During the taste:** everything Plus has. That means unlimited reads, unlimited saves,
   the originality filter, the Plus ScenePartner limits and script uploads.
4. **When it ends:** the account goes back to free with no notice. The month's 5 reads are
   already used, so the next wall they hit carries the ask:
   - "Your 3 days are up. Keep everything for $12 a month or $99 a year."
   - The buttons go to Stripe checkout with **no trial**: the card is charged today.
5. **Once per person, ever.**
6. **No email when the taste ends.** This keeps Canberk's 2026-09-29 rule against
   trial-ending emails. The wall is the only ask.

## Eligibility

A user is granted a taste only when all of these are true:

- They are on free right now.
- They have never paid on the web: no Stripe subscription and no paid invoice.
- They have no Ghost Light / RevenueCat subscription or record. RevenueCat webhooks write
  to the same subscription row and could overwrite the taste.
- They are not on a comp now, and are not an educator or a student.
- They have never had a taste (`users.taste_started_at IS NULL`).
- The admin switch `wall_taste_enabled` is on.
- The request is from the web. The Ghost Light read limit is unchanged.

If any check fails, the wall behaves exactly as it does today.

## How it works

- **Grant:** the server decides, in the read path, at the point where `_user_has_unlimited_reads`
  is false and the user is at the limit. That is `GET /monologues/{id}` and
  `POST /monologues/{id}/read`.
  - It reuses the comp mechanism that admin grants, `grant_comp.py` and class links already
    use: `status="trialing"`, `source="taste"`, `trial_end = now + 72h`, no Stripe id.
  - In the same transaction it sets `users.taste_started_at` (a new nullable timestamp,
    added before the deploy).
  - The response carries `taste: {started: true, ends_at}` so the client can show the banner.
- **Expiry:** none needed. `is_active` already goes false once `trial_end` passes, at read
  time.
- **After a taste, checkout has no trial.** The trial logic in `trial_length.py` and the
  `trial=1` checkout path both give 0 trial days when `taste_started_at` is set.
- **Wall copy:** if `taste_started_at` is set and the taste is no longer active, the wall
  components show the "Your 3 days are up" copy and link to checkout without `trial=1`. The
  components are ReadGate, MonologueWall, ReadWallModal, the panel on /monologues and
  MonologuePaywallModal.
- **Switch:** `wall_taste_enabled` in /admin, next to the other switches. It is off on
  deploy, and Canberk turns it on.

## Gaps fixed in the same change

These are existing gaps that the taste would expose:

1. `/usage-limits` (subscriptions.py:461-533) never checks `is_active`, so after any comp
   expires the meter shows unlimited reads while the server walls. It will check `is_active`.
2. `lifecycle._paid_user_ids` (email/lifecycle.py:75-82) reads only the status, so an
   expired comp stays "trialing" and is silently cut off from every lifecycle email. It will
   check `is_active`.
3. `paywall_seen_no_trial` (email/triggered.py) skips anyone with `taste_started_at` set, so
   no email can read as a trial-ending email.
4. The founder's comp-expiry digest (comp_expiry.py) leaves out `source="taste"`.
5. The grant refuses any row with a Stripe or RevenueCat id. It never overwrites a payer.

## Measurement

New events, each with `client_platform`:

- `taste_started`
- `taste_ended`, with outcome `paid` or `lapsed`, written on the first wall or `/me` after
  `trial_end`
- `taste_converted`: a paid invoice within 7 days after the taste ends

**Baseline (30 days):** about 49 people reached the limit, 7 started checkout, 1 paid.

**Read at 14 days:** how many tastes started, how many converted, and checkouts started
against completed. Success means at least 3 payers from tastes in the first 14 days, more
than the 1 per month we see now. If it does worse than the baseline, turn the switch off.

## Not in scope

- The price ($12 a month, $99 a year). That decision waits until after Oct 23, like before.
- A cheap audition pass. Considered and declined for now (2026-10-21).
- The Ghost Light read limit and the app's own trial.
- An email when the taste ends.

## Tests

- **Eligibility:** each exclusion on its own, plus the once-ever rule.
- **Grant:** the read path at the limit grants once, returns the full text and the `taste`
  payload, and the second call does not grant again.
- **Expiry:** after `trial_end`, reads wall again, `/usage-limits` shows the free limit and
  checkout has 0 trial days.
- **Payers untouched:** Stripe and RevenueCat rows are never modified.
- **Switch off:** today's behaviour, byte for byte.
- **Lifecycle:** an expired comp counts as free in `_paid_user_ids`. `paywall_seen_no_trial`
  skips tasters.
