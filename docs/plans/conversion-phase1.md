# Conversion Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product ask for money at the moments an actor is getting value, measure every step of that ask in Postgres, follow up by email when someone walks away from a price, and hand Canberk a daily list of people worth writing to.

**Architecture:** Four layers, each one feeding the next. (1) The product shows a price: walls where a free limit ends, asks where something just went well. (2) Every show, dismiss, click, checkout and trial lands in `user_events`, read through one view, `funnel_daily`. (3) A triggered-email job reads those events and sends approved plain-text emails, capped at two per person per week. (4) A daily agent run reads the funnel and the inbox, files opt-outs, and leaves Gmail drafts for Canberk to send. Nothing personal is sent without him.

**Tech Stack:** Next.js (App Router) + vitest, FastAPI + SQLAlchemy + unittest (`.venv/bin/python -m pytest tests/ -q`), Supabase Postgres, Stripe Checkout, Resend.

**Spec:** `~/Downloads/actorrise-conversion-phase1.md`. **Review of it against prod:** `docs/plans/2026-09-29-conversion-phase1-review.md`.

**Branch:** `feat/conversion-phase1`, in a worktree at `.worktrees/conversion-phase1`. Main carries staged, uncommitted work on `lib/analytics.ts` and the landing partners strip; the worktree keeps this away from it.

---

## Status, 2026-09-29

**Merged to main and pushed 2026-09-29, together with `feat/mobile-first-run`.** Canberk's word: "merge".

| Check, run on the merged tip before the push | Result |
|---|---|
| Backend tests | 1,759 pass (1,702 before this work) |
| Frontend tests | 207 pass (169 before) |
| `tsc --noEmit` | clean |
| `next build` | compiles, 594 static pages |
| Rendered at 390px, logged in, light and dark | login, search, hub, the "Late" scene end to end, the end page |
| On a real iPhone | **not yet** |

### Done

- [x] `backend/scripts/widen_lifecycle_touch.sql` applied to prod. `touch` is `varchar(32)`, 681 rows untouched, the UNIQUE still there.
- [x] `backend/scripts/add_funnel_daily_view.sql` applied to prod. `security_invoker=true`, no grant to anon or authenticated.
- [x] Merged and pushed. The trial is 7 or 14 days for everyone, the two new asks are live, and the pricing line reads "then a week of Plus free, two if you finish a scene".

### Correction, 2026-09-29

The review and this plan both said Stripe's `trial_will_end` "already emails the user", and
`trial_ending` was dropped for that reason. **That was wrong.** The webhook does fire, and
`send_trial_ending_notification` does send, but to `canberk@actorrise.com`. No actor has ever
been told by ActorRise that their card was about to be charged. Found when Canberk asked
"after their trial ends would they get charged?"

`trial_ending` is built now (`backend/emails/lifecycle/trial_ending.txt`). It is a notice, so
it goes regardless of marketing opt-in and outside the weekly cap, 1 to 3 days before the
charge, to Stripe trials only. Behind the same switch as the others, which is off.

### Still Canberk's

1. **On an iPhone:** does Riley's first line play after Answer with no Begin screen, and does the bottom menu sit still against Chrome's toolbar. Neither can be shown in a desktop browser.
2. **A brand-new account:** sign up, see the onboarding card on the hub, close it, see "You're late." underneath.
3. **Read the four emails** in `backend/emails/lifecycle/`, send yourself the set (`uv run python scripts/triggered_emails.py --test canberk@actorrise.com`), then switch on "Triggered emails" in `/admin/emails`. They are OFF and stay off until then.
4. **Two Stripe trials end by 2026-10-01.** See `outputs/conversion/2026-09-29.md`, section 3.
5. Decide Task B5 (the reply-CURTAIN Stripe link still runs 14 days, and CLAUDE.md still says the in-app trial is 14).

### Read week 1 on 2026-10-06

```sql
select * from funnel_daily where d >= '2026-09-29' order by d;

select properties->>'gate' gate, properties->>'kind' kind,
       count(*) hits, count(distinct user_id) users
from user_events
where event_name = 'paywall_hit' and created_at >= '2026-09-29'
group by 1, 2 order by 3 desc;
```

Against the baseline at the foot of this file. `paywall_hits` was 0 on every day before the deploy because the name did not exist.

### Where what shipped differs from the tasks below

The tasks were written before the code. These are the places the code is right and the task text is not.

| Task | Plan said | Shipped | Why |
|---|---|---|---|
| B1 | The second week is earned by a completed session **or** the `guided_scene_finished` event | A completed `rehearsal_sessions` row only | The event arrives over `POST /api/events`, which any signed-in client can call. Reading it would have let a browser claim 14 days. The background security review caught this. All 6 actors holding the event also hold a completed session, tap mode included, so nobody lost a week. |
| B3 | `useTrialWords` lives in `lib/trial.ts` | It lives in `hooks/useTrialWords.ts` | Keeps `lib/trial.ts` pure, so its test needs no React. |
| B4 | One quiet line as a bare `Link` | `components/billing/EarnSecondWeek.tsx` | Six hosts, and an earned trial must leave no empty paragraph behind. |
| C1 | Four functions | Adds `recordClick`, `parseStore`, and `lib/paywall/slot.ts` | Two strips pin to the same place. The slot lets one ask hold the screen at a time. |
| C3 | third_save copy promised cutting to time | "Plus lets you rehearse every one of them out loud" | Cutting is free. The ask may only name what Plus adds. |
| C4, C5 | The hook is called where the component mounts | The strip is its own component, mounted at the moment | `useTrialOffer` reads the limiter once, at mount. Mounted in the layout it would read the state from page load. |
| C4, C5 | Strip at the foot of the screen | Rides above the Rehearse bar on `/monologue/<id>` below `lg` | It would have covered the one button that page exists for. |
| D2 | Weekly cap of 2 | Cap of 2 **and** nothing inside 48 hours of the last email | Without the gap, someone due two touches got both an hour apart. Lives in `lifecycle.py` and binds day3 and day10 too. |
| D2 | `paywall_seen_no_trial` anchors on any `paywall_hit` | Walls only | The email says "you ran into the free limit". Someone shown an ask after a good scene ran into nothing. |
| D2 | | Skips anyone who has held a Stripe subscription, for the two touches that offer the trial | Checkout refuses them the trial. |
| D3 | Link is the checkout URL | `actorrise.com/trial?e=<touch>`, a redirect in `next.config.ts` | Plain text, so the address is read. The checkout's own is four parameters long. |
| D5 | `?e=` on every lifecycle link | On the three new emails only | day3 and day10 are live and approved. Changing their links is a change to a live email. |
| E2 | The run writes to the list itself | `backend/scripts/opt_out.py` | One tested path that does the list and `marketing_opt_in` together. |

### Found on the way, not part of the plan

- **Two Stripe trials end inside three days** (2026-09-30 and 2026-10-01). One has not rehearsed or run a monologue since it started. Section 3 of `outputs/conversion/2026-09-29.md`.
- **One actor hit the read wall 18 times in two days** and holds 16 saved pieces. Top of section 5 in the same brief.
- **The bounced list is all people day-10 already asked.** 30 of 30. `outreach/founder/bounced.md` says what to do instead.
- **Onboarding completion fell 31% week on week** (75 to 52) on signups down 6%. Not caused by this branch, which is not deployed. Worth its own look.

---

## Decisions (made 2026-09-29)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Trial length | **7 days. 14 if the actor has finished a scene.** Decided server side at checkout, from a session the server closed as completed. | Canberk, 2026-09-29. The second week is earned by the one behaviour that shows the product working. 6 of 22 people who started the guided scene finished it; 24 actors hold a completed session of any kind. |
| 2 | Free tier | **Ask more, block nothing new.** The three walls that exist stay (5 reads a month, 3 ScenePartner sessions a month, monologue work after the reverse trial). Saves, the cut editor and notes stay free. New asks go where value just happened. | Saving is what the day-1 reminder and both lifecycle emails are anchored on, and 82 free users already hold 4+ saves. Cut editor and notes reach 8 and 9 people a month, so walling them adds no volume. Revisit a hard save cap only if asks convert under 1% after 30 days. |
| 3 | Goal unit and start | **Distinct real users who saw a price, per day, from 2026-09-27.** July and August are ignored. | The money events did not exist in Postgres before 2026-09-27. Baseline so far: 9 users in 2 days, out of about 35 active. One checkout started. |
| 4 | Emails | **Three money touches first:** `checkout_abandoned`, `trial_ended_no_pay`, `paywall_seen_no_trial`. `three_saves`, `unfinished_cut`, `dormant_book` are held. `trial_ending` was left out on 2026-09-29 on a wrong reading and added the same day: see the correction under Status. | day3 and day10 have sent 681 and brought back about 1 in 320. The money touches go to people who looked at a price, which is a different population. |

**Targets, 30 days after Phase C ships:** 150 distinct users see a price, 10 `checkout_started`, 5 `trial_started`, 3 first charges. Onboarding completion and day-2 return must not fall.

**Rules that hold across every phase**

- No dashes in any copy. First person singular. Sign off as Canberk.
- Every email to a current user carries the reply line: "reply UNSUBSCRIBE and I'll take you off the list, no hard feelings", plus the unsubscribe link.
- Nothing sends to `email_do_not_contact`, with one exception in Task D2.
- No more than 2 lifecycle or triggered emails per user in 7 days.
- Search ranking, My Book UI and the redesign are not touched. New surfaces reuse `.t-offer`, `.t-strip` and `.t-wall`.
- Marketing pages (`/pricing`, landing) are changed on the branch and **not pushed until Canberk reads them**.

---

## File structure

| File | Responsibility | Phase |
|---|---|---|
| `backend/app/services/events.py` (modify) | Vocabulary: new money and email event names; `record_subscription_event` | A |
| `backend/app/api/webhooks.py` (modify) | Write `checkout_completed` and `trial_started` to `user_events` | A |
| `backend/scripts/add_funnel_daily_view.sql` (create) | The `funnel_daily` view | A |
| `lib/events.ts`, `lib/analytics.ts` (modify) | `paywall_hit`, `paywall_dismissed`, `paywall_cta_clicked` emitted from the existing trackers | A |
| `backend/app/services/trial_length.py` (create) | 7 or 14: the one place that decides | B |
| `backend/app/api/subscriptions.py` (modify) | Checkout uses `trial_days_for`; `/me` returns `trial_days` | B |
| `lib/trial.ts` (create) | Words for a trial length: "Start 1 week free" | B |
| 12 components and pages listed in Task B4 (modify) | Stop hardcoding "2 weeks" | B |
| `lib/paywall/eligibility.ts` (create) | Pure rules: per-gate cooldown, session dismiss cap | C |
| `lib/paywall/copy.ts` (create) | Gate copy and variant ids | C |
| `components/billing/TrialOffer.tsx` (modify) | Uses the two files above | C |
| `components/billing/ReadsLeft.tsx` (create) | The reads meter strip | C |
| `backend/app/services/email/triggered.py` (create) | Event-anchored email selection and send | D |
| `backend/scripts/widen_lifecycle_touch.sql` (create) | `touch` to `varchar(32)` | D |
| `backend/emails/lifecycle/*.txt` (create) | Copy drafts for Canberk to approve | D |
| `backend/scripts/conversion_brief.py` (create) | The daily read: funnel, who walked away, who to write to | E |
| `.claude/commands/conversion-loop.md` (create) | The daily agent run | E |
| `backend/scripts/outreach/heavy_users.sql`, `bounced_users.sql` (create) | Founder outreach lists | E |

---

# Phase A: Tracking

Ships first. Nothing else is judged until this is live.

### Task A1: Vocabulary

**Files:**
- Modify: `backend/app/services/events.py`
- Test: `backend/tests/test_conversion_events.py` (create)

- [ ] **Step 1: Write the failing test**

```python
"""The money path's vocabulary: which names exist and who may send them."""

import unittest

from app.services import events


class VocabularyTests(unittest.TestCase):
    def test_server_names(self):
        for name in ("trial_started", "checkout_completed", "email_sent"):
            self.assertIn(name, events.SERVER_EVENT_NAMES, name)
            self.assertNotIn(name, events.CLIENT_EVENT_NAMES, name)

    def test_client_names(self):
        for name in ("paywall_hit", "paywall_dismissed", "paywall_cta_clicked", "email_clicked"):
            self.assertIn(name, events.CLIENT_EVENT_NAMES, name)

    def test_names_fit_the_column(self):
        for name in events.EVENT_NAMES:
            self.assertLessEqual(len(name), 48, name)
```

- [ ] **Step 2: Run it, expect FAIL** — `cd backend && .venv/bin/python -m pytest tests/test_conversion_events.py -q`
- [ ] **Step 3: Add the names**

In `SERVER_EVENT_NAMES`, after `"trial_converted"`:

```python
        # The two facts the webhook is sure of and only ever told GA4. Without
        # them checkout_started has no other end, and "abandoned" cannot be
        # computed at all.
        "checkout_completed",  # {subscription_id, tier, billing_period, trial}
        "trial_started",  # {subscription_id, trial_days, earned}
        # One row per lifecycle or triggered email that actually left.
        "email_sent",  # {touch}
```

In `CLIENT_EVENT_NAMES`, after `"checkout_started"`:

```python
        # One name for every moment a price is shown, whatever drew it. `gate`
        # is the old feature or trigger value; `kind` is wall (a limit said no)
        # or ask (something went well). upgrade_modal_viewed and
        # trial_offer_shown keep firing so rows before 2026-09-29 still join.
        "paywall_hit",  # {gate, kind, variant, surface, tier_current}
        "paywall_dismissed",  # {gate, kind, surface, tier_current}
        "paywall_cta_clicked",  # {gate, kind, variant, surface, tier_current}
        "email_clicked",  # {touch}
```

- [ ] **Step 4: Run it, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "Events: the money path gets names for every step"`

### Task A2: One event per subscription, for any name

**Files:**
- Modify: `backend/app/services/events.py`
- Test: `backend/tests/test_conversion_events.py`

Stripe retries webhooks. `record_trial_ended` already dedupes on `properties.subscription_id`; the same guard is needed for `trial_started` and `checkout_completed`.

- [ ] **Step 1: Write the failing test** (append)

```python
from unittest import mock

from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from tests.dbfixture import memory_db, restore


class _NoClose:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return getattr(self._db, name)

    def close(self):
        pass


class SubscriptionEventTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="a@b.c", supabase_id="s1")
        self.db.add(self.user)
        self.db.commit()
        self.patcher = mock.patch.object(events, "SessionLocal", lambda: _NoClose(self.db))
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        restore(self.saved)

    def test_a_retried_webhook_writes_one_row(self):
        first = events.record_subscription_event(
            self.db, self.user.id, "trial_started", "sub_1", trial_days=7, earned=False
        )
        again = events.record_subscription_event(
            self.db, self.user.id, "trial_started", "sub_1", trial_days=7, earned=False
        )
        self.assertTrue(first)
        self.assertFalse(again)
        row = self.db.query(UserEvent).one()
        self.assertEqual(row.properties["trial_days"], 7)
        self.assertEqual(row.properties["subscription_id"], "sub_1")

    def test_names_do_not_block_each_other(self):
        events.record_subscription_event(self.db, self.user.id, "checkout_completed", "sub_1")
        events.record_subscription_event(self.db, self.user.id, "trial_started", "sub_1")
        self.assertEqual(self.db.query(UserEvent).count(), 2)

    def test_trial_ended_still_dedupes(self):
        self.assertTrue(events.record_trial_ended(self.db, self.user.id, "sub_1", "converted"))
        self.assertFalse(events.record_trial_ended(self.db, self.user.id, "sub_1", "converted"))
```

- [ ] **Step 2: Run it, expect FAIL** (`record_subscription_event` not defined)
- [ ] **Step 3: Implement.** Replace the body of `record_trial_ended` and add the general function above it:

```python
def record_subscription_event(
    db,
    user_id: Optional[int],
    event_name: str,
    subscription_id: Optional[str],
    **extra: Any,
) -> bool:
    """One `event_name` per Stripe subscription, whichever webhook says so first.

    Stripe retries, and a trial's end can reach us three ways (invoice.paid,
    subscription.updated with previous status trialing, subscription.deleted
    inside the trial window) in no fixed order. The subscription id in the
    properties is the dedupe key.
    """
    try:
        if subscription_id:
            dup = (
                db.query(UserEvent.id)
                .filter(
                    UserEvent.event_name == event_name,
                    UserEvent.properties["subscription_id"].as_string() == subscription_id,
                )
                .first()
            )
            if dup is not None:
                return False
    except Exception:
        # A failed lookup must not block the write; a rare duplicate is a
        # smaller error than a missing row.
        try:
            db.rollback()
        except Exception:
            pass
    return record_user_event(user_id, event_name, {"subscription_id": subscription_id, **extra})


def record_trial_ended(
    db,
    user_id: Optional[int],
    subscription_id: Optional[str],
    outcome: str,
    **extra: Any,
) -> bool:
    """One trial_ended per Stripe subscription, labelled with how it ended."""
    return record_subscription_event(
        db, user_id, "trial_ended", subscription_id, outcome=outcome, **extra
    )
```

- [ ] **Step 4: Run** `tests/test_conversion_events.py tests/test_trial_events.py`, expect PASS
- [ ] **Step 5: Commit** — `git commit -m "Events: one row per subscription for any name, not only trial_ended"`

### Task A3: The webhook writes what it knows

**Files:**
- Modify: `backend/app/api/webhooks.py` (`handle_checkout_completed`, the GA4 block that starts `# GA4: the money path`)

- [ ] **Step 1:** Directly above that GA4 `try:` block, add:

```python
    # The same two facts, in Postgres. GA4 gets them below, and GA4 cannot be
    # joined to a users row: on 2026-09-29 one checkout_started had no way to
    # say whether it ever finished.
    try:
        from app.services.events import record_subscription_event

        _tier_row = db.query(PricingTier).filter(PricingTier.id == tier_id).first()
        _sub_id = session.get("subscription")
        _days = _trial_days_of(meta, _sub_id)
        record_subscription_event(
            db, user_id, "checkout_completed", _sub_id,
            tier=_tier_row.name if _tier_row else "plus",
            billing_period=billing_period,
            trial=_days > 0,
        )
        if _days > 0:
            record_subscription_event(
                db, user_id, "trial_started", _sub_id,
                trial_days=_days,
                earned=(meta.get("trial_earned") == "1"),
            )
    except Exception as e:
        print(f"Warning: checkout events not recorded: {e}")
```

- [ ] **Step 2:** Lift the trial-length recovery out of the GA4 block into a module-level helper, and use it in both places:

```python
def _trial_days_of(meta: dict, subscription_id: str | None) -> int:
    """Trial length in days: from our metadata, else from the subscription.

    Payment-link checkouts (the reply-CURTAIN flow) carry no app metadata but
    do run a real trial, so its length is read back off Stripe.
    """
    days = int(meta.get("trial_days") or 0)
    if days or not subscription_id:
        return days
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        start, end = sub.get("trial_start"), sub.get("trial_end")
        if start and end:
            return round((end - start) / 86400)
    except Exception:
        pass
    return 0
```

In the GA4 block, replace the `trial_days = int(...)` lines through the inner `except` with `trial_days = _trial_days_of(meta, session.get("subscription"))`.

- [ ] **Step 3: Test** — add to `tests/test_conversion_events.py`:

```python
class TrialDaysOfTests(unittest.TestCase):
    def test_metadata_wins(self):
        from app.api import webhooks

        self.assertEqual(webhooks._trial_days_of({"trial_days": "7"}, "sub_1"), 7)

    def test_payment_link_reads_stripe(self):
        from app.api import webhooks

        fake = {"trial_start": 1_000_000, "trial_end": 1_000_000 + 14 * 86400}
        with mock.patch.object(webhooks.stripe.Subscription, "retrieve", return_value=fake):
            self.assertEqual(webhooks._trial_days_of({}, "sub_1"), 14)

    def test_no_trial(self):
        from app.api import webhooks

        with mock.patch.object(webhooks.stripe.Subscription, "retrieve", return_value={}):
            self.assertEqual(webhooks._trial_days_of({}, "sub_1"), 0)
```

- [ ] **Step 4: Run the whole backend suite**, expect PASS — `.venv/bin/python -m pytest tests/ -q`
- [ ] **Step 5: Commit** — `git commit -m "Webhook: checkout_completed and trial_started land in user_events"`

### Task A4: The client emits `paywall_hit` from the trackers it already has

**Files:**
- Modify: `lib/events.ts`, `lib/analytics.ts`
- Test: `lib/paywall-events.test.ts` (create)

Every wall and ask already calls `trackUpgradeModalViewed` or `trackTrialOfferShown`. Emitting the new name inside those two functions covers all nine surfaces without touching one of them.

- [ ] **Step 1:** In `lib/events.ts`, add to `UserEventName`: `"paywall_hit" | "paywall_dismissed" | "paywall_cta_clicked" | "email_clicked"`.
- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { paywallProps, surfaceOf } from "./paywall-events";

describe("surfaceOf", () => {
  it("names the room, not the row", () => {
    expect(surfaceOf("/monologue/812/work")).toBe("monologue");
    expect(surfaceOf("/scenes/4/rehearse")).toBe("scenes");
    expect(surfaceOf("/")).toBe("home");
    expect(surfaceOf("")).toBe("home");
  });
});

describe("paywallProps", () => {
  it("carries gate, kind, surface and tier", () => {
    expect(paywallProps("monologue_read", "wall", "free", "/monologues")).toEqual({
      gate: "monologue_read",
      kind: "wall",
      surface: "monologues",
      tier_current: "free",
    });
  });
  it("adds the variant when there is one", () => {
    expect(paywallProps("third_save", "ask", "free", "/monologues", "save_a").variant).toBe("save_a");
  });
});
```

- [ ] **Step 3: Create `lib/paywall-events.ts`**

```ts
/**
 * paywall_hit and its two siblings: one shape for every moment a price is shown.
 *
 * Pure on purpose. lib/analytics.ts does the sending; this only says what is
 * sent, so the shape can be tested without a window.
 */

export type PaywallKind = "wall" | "ask";

export type PaywallProps = {
  gate: string;
  kind: PaywallKind;
  surface: string;
  tier_current: string;
  variant?: string;
};

/** The first path segment: which room of the product the price was shown in. */
export function surfaceOf(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "home";
}

export function paywallProps(
  gate: string,
  kind: PaywallKind,
  tier: string,
  pathname: string,
  variant?: string,
): PaywallProps {
  const props: PaywallProps = { gate, kind, surface: surfaceOf(pathname), tier_current: tier };
  if (variant) props.variant = variant;
  return props;
}
```

- [ ] **Step 4:** In `lib/analytics.ts`, import it and extend the three money trackers, and add the click:

```ts
import { paywallProps, type PaywallKind } from "./paywall-events";

const here = () => (typeof window === "undefined" ? "" : window.location.pathname);

export function trackUpgradeModalViewed(params: UpgradeModalViewedParams) {
  sendEvent("upgrade_modal_viewed", params);
  trackEvent("upgrade_modal_viewed", params);
  trackEvent("paywall_hit", paywallProps(params.feature, "wall", params.tier_current, here()));
}

export function trackTrialOfferShown(params: TrialOfferShownParams & { variant?: string }) {
  sendEvent("trial_offer_shown", params);
  trackEvent("trial_offer_shown", params);
  trackEvent(
    "paywall_hit",
    paywallProps(params.trigger, "ask", params.tier_current, here(), params.variant),
  );
}

export function trackTrialOfferDismissed(params: TrialOfferDismissedParams) {
  sendEvent("trial_offer_dismissed", params);
  trackEvent("trial_offer_dismissed", params);
  trackEvent("paywall_dismissed", paywallProps(params.trigger, "ask", params.tier_current, here()));
}

export function trackPaywallCtaClicked(gate: string, kind: PaywallKind, tier: string, variant?: string) {
  trackEvent("paywall_cta_clicked", paywallProps(gate, kind, tier, here(), variant));
}
```

- [ ] **Step 5:** Call `trackPaywallCtaClicked` from the CTA of each surface: `useTrialOffer().accept` (kind `ask`), and an `onClick` on the CTA `Link` in `MonologueWall`, `ReadGate`, `UpgradeModal`, `MonologuePaywallModal` (kind `wall`, gate = the component's `feature`).
- [ ] **Step 6: Run** `npm test` and `npx tsc --noEmit`, expect PASS
- [ ] **Step 7: Commit** — `git commit -m "Every price shown is a paywall_hit, every click on one is counted"`

### Task A5: `funnel_daily`

**Files:**
- Create: `backend/scripts/add_funnel_daily_view.sql`

- [ ] **Step 1: Write the view**

```sql
-- The conversion funnel, one row per UTC day (docs/plans/conversion-phase1.md).
--
-- security_invoker: a view in public is served by the Supabase API and by
-- default runs with its owner's rights, which would step around the RLS
-- lockdown of 2026-08-23. With it, anon and authenticated hit user_events'
-- own RLS and read nothing. The backend connects as the owner.
--
-- Distinct users throughout, staff dropped. price_seen folds in the two older
-- names so days before paywall_hit existed are not read as zero.

create or replace view public.funnel_daily
with (security_invoker = true) as
select
  date_trunc('day', e.created_at at time zone 'utc')::date as d,
  count(distinct e.user_id) filter (where e.event_name = 'signup_completed')        as signups,
  count(distinct e.user_id) filter (where e.event_name = 'onboarding_completed')    as onboarded,
  count(distinct e.user_id) filter (where e.event_name = 'first_search_submitted')  as searched,
  count(distinct e.user_id) filter (where e.event_name = 'monologue_work_started')  as working,
  count(distinct e.user_id) filter (
    where e.event_name in ('paywall_hit', 'upgrade_modal_viewed', 'trial_offer_shown')) as price_seen,
  count(*) filter (where e.event_name = 'paywall_hit')                              as paywall_hits,
  count(distinct e.user_id) filter (where e.event_name = 'paywall_cta_clicked')     as cta_clicked,
  count(distinct e.user_id) filter (where e.event_name = 'checkout_started')        as checkouts,
  count(distinct e.user_id) filter (where e.event_name = 'checkout_completed')      as checkouts_done,
  count(distinct e.user_id) filter (where e.event_name = 'trial_started')           as trials,
  count(distinct e.user_id) filter (
    where e.event_name = 'trial_converted'
       or (e.event_name = 'trial_ended' and e.properties->>'outcome' = 'converted')) as paid
from public.user_events e
join public.users u on u.id = e.user_id
where coalesce(u.exclude_from_stats, false) = false
group by 1;

revoke all on public.funnel_daily from anon, authenticated;
```

- [ ] **Step 2: Apply on Supabase** (SQL editor, project `ppvqmbzuqvzpiuqaiqfy`). Additive, no table is altered.
- [ ] **Step 3: Verify** — `select * from funnel_daily order by d desc limit 7;` returns rows; `paywall_hits` is nonzero from the first day Task A4 is deployed.
- [ ] **Step 4: Commit** — `git commit -m "funnel_daily: the money path as one view"`

---

# Phase B: The earned trial

7 days. 14 for anyone who has finished a scene.

### Task B1: The one place that decides

**Files:**
- Create: `backend/app/services/trial_length.py`
- Test: `backend/tests/test_trial_length.py`

- [ ] **Step 1: Write the failing test**

```python
"""7 days, or 14 for an actor who has finished a scene."""

import unittest
from unittest import mock

from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import trial_length
from tests.dbfixture import memory_db, restore


class TrialLengthTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="a@b.c", supabase_id="s1")
        self.db.add(self.user)
        self.db.commit()
        # rehearsal_sessions hangs off scenes and user_scripts, which carry
        # Postgres-only columns; that lookup is patched, the event one is real.
        self.patcher = mock.patch.object(trial_length, "_completed_a_session", lambda db, uid: False)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        restore(self.saved)

    def test_default_is_a_week(self):
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)
        self.assertFalse(trial_length.has_finished_a_scene(self.db, self.user.id))

    def test_the_guided_scene_earns_the_second(self):
        self.db.add(UserEvent(user_id=self.user.id, event_name="guided_scene_finished", properties={}))
        self.db.commit()
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 14)

    def test_starting_is_not_finishing(self):
        self.db.add(UserEvent(user_id=self.user.id, event_name="guided_scene_started", properties={}))
        self.db.commit()
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_any_completed_session_counts(self):
        with mock.patch.object(trial_length, "_completed_a_session", lambda db, uid: True):
            self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 14)

    def test_someone_elses_scene_does_not(self):
        other = User(email="o@b.c", supabase_id="s2")
        self.db.add(other)
        self.db.commit()
        self.db.add(UserEvent(user_id=other.id, event_name="guided_scene_finished", properties={}))
        self.db.commit()
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)

    def test_a_failed_lookup_gives_the_week(self):
        def boom(db, uid):
            raise RuntimeError("db gone")

        with mock.patch.object(trial_length, "_completed_a_session", boom):
            self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), 7)
```

- [ ] **Step 2: Run it, expect FAIL**
- [ ] **Step 3: Implement**

```python
"""How long a Plus trial runs for this actor: a week, or two if they earned it.

The second week belongs to anyone who has finished a scene. It is the one
behaviour that shows the product working, and until now it won nothing. Decided
here and only here: checkout asks this module, /me reports what it says, and
every surface prints that number instead of carrying its own.
"""

from __future__ import annotations

import logging

from app.models.actor import RehearsalSession
from app.models.user_event import UserEvent

logger = logging.getLogger(__name__)

BASE_TRIAL_DAYS = 7
EARNED_TRIAL_DAYS = 14


def _completed_a_session(db, user_id: int) -> bool:
    return (
        db.query(RehearsalSession.id)
        .filter(RehearsalSession.user_id == user_id, RehearsalSession.status == "completed")
        .first()
        is not None
    )


def _finished_the_guided_scene(db, user_id: int) -> bool:
    # The guided run can end in tap mode without the deliver endpoint ever
    # closing the session, so the browser's own report counts as well.
    return (
        db.query(UserEvent.id)
        .filter(UserEvent.user_id == user_id, UserEvent.event_name == "guided_scene_finished")
        .first()
        is not None
    )


def has_finished_a_scene(db, user_id: int) -> bool:
    try:
        return _completed_a_session(db, user_id) or _finished_the_guided_scene(db, user_id)
    except Exception as exc:  # noqa: BLE001
        # Never let a lookup stand between an actor and the checkout.
        logger.warning("trial_length: lookup failed for %s: %s", user_id, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return False


def trial_days_for(db, user_id: int) -> int:
    return EARNED_TRIAL_DAYS if has_finished_a_scene(db, user_id) else BASE_TRIAL_DAYS
```

- [ ] **Step 4: Run it, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "Trial length: a week, two for an actor who has finished a scene"`

### Task B2: Checkout asks, `/me` reports

**Files:**
- Modify: `backend/app/api/subscriptions.py`

- [ ] **Step 1:** In `create_checkout_session`, replace `trial_period_days = 14` and its comment with:

```python
        # A week, or two for an actor who has finished a scene
        # (services/trial_length.py). Then it rolls into Plus monthly.
        from app.services.trial_length import EARNED_TRIAL_DAYS, trial_days_for

        trial_period_days = trial_days_for(db, int(current_user.id))
        trial_earned = trial_period_days == EARNED_TRIAL_DAYS
```

Initialise `trial_earned = False` next to `trial_period_days: int | None = None`, and add to the `metadata` dict: `"trial_earned": "1" if trial_earned else "0",`.

- [ ] **Step 2:** Add two fields to `SubscriptionResponse`:

```python
    # What a trial would run for if this actor started one now: 7, or 14 once
    # they have finished a scene. Every surface prints this number.
    trial_days: int = 7
    trial_earned: bool = False
```

- [ ] **Step 3:** In `get_my_subscription`, compute once at the top and pass to all four `SubscriptionResponse(...)` returns:

```python
    from app.services.trial_length import EARNED_TRIAL_DAYS, trial_days_for

    trial_days = trial_days_for(db, int(current_user.id))
    trial_kw = {"trial_days": trial_days, "trial_earned": trial_days == EARNED_TRIAL_DAYS}
```

Each return gains `**trial_kw`.

- [ ] **Step 4:** Update the three comments in this file that say 14 days or 2 weeks (`trial: bool = False  # ...`, and the two above the trial branch).
- [ ] **Step 5: Run the backend suite**, expect PASS
- [ ] **Step 6: Commit** — `git commit -m "Checkout runs the trial the actor has earned; /me says how long"`

### Task B3: Words for a number

**Files:**
- Create: `lib/trial.ts`
- Test: `lib/trial.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { trialWords } from "./trial";

describe("trialWords", () => {
  it("a week", () => {
    const w = trialWords(7);
    expect(w.cta).toBe("Start 1 week free");
    expect(w.short).toBe("1 week free");
    expect(w.span).toBe("a week");
    expect(w.days).toBe(7);
  });
  it("two weeks", () => {
    const w = trialWords(14);
    expect(w.cta).toBe("Start 2 weeks free");
    expect(w.short).toBe("2 weeks free");
    expect(w.span).toBe("two weeks");
  });
  it("falls back to a week when it has not loaded", () => {
    expect(trialWords(undefined).days).toBe(7);
  });
  it("says days for anything else", () => {
    expect(trialWords(10).cta).toBe("Start 10 days free");
  });
});
```

- [ ] **Step 2: Implement**

```ts
/**
 * A trial length as the words the product prints.
 *
 * The length is decided on the server (backend/app/services/trial_length.py)
 * and arrives on /api/subscriptions/me as trial_days. Nothing in the client
 * carries its own number: twelve surfaces said "2 weeks" by hand, which is how
 * a changed offer goes on being quoted at the old length.
 */

import { useSubscription } from "@/hooks/useSubscription";

export type TrialWords = {
  days: number;
  /** "Start 1 week free" */
  cta: string;
  /** "1 week free" */
  short: string;
  /** "a week", for the middle of a sentence */
  span: string;
  /** True once the actor has finished a scene. */
  earned: boolean;
};

export function trialWords(days: number | undefined, earned = false): TrialWords {
  const d = days && days > 0 ? days : 7;
  const short = d === 7 ? "1 week free" : d === 14 ? "2 weeks free" : `${d} days free`;
  const span = d === 7 ? "a week" : d === 14 ? "two weeks" : `${d} days`;
  return { days: d, cta: `Start ${short}`, short, span, earned };
}

export function useTrialWords(): TrialWords {
  const { subscription } = useSubscription();
  return trialWords(subscription?.trial_days, subscription?.trial_earned ?? false);
}
```

Add `trial_days?: number; trial_earned?: boolean;` to `SubscriptionData` in `hooks/useSubscription.ts`.

- [ ] **Step 3: Run** `npm test`, expect PASS
- [ ] **Step 4: Commit** — `git commit -m "lib/trial: a trial length as words"`

### Task B4: Twelve surfaces stop saying "2 weeks" by hand

**Files (all modify):**

| File | Line (main @ b54a8d2d) | Now | Becomes |
|---|---|---|---|
| `components/billing/TrialOffer.tsx` | 150, 213 | `"Start 2 weeks free"`, `2 weeks free` | `words.cta`, `words.short` |
| `components/billing/UpgradeModal.tsx` | 75, 108 | same | same |
| `components/monologue-work/MonologuePaywallModal.tsx` | 35, 93 | "Two weeks free, card on file" | `` `${cap(words.span)} free, card on file` `` |
| `components/monologue/MonologueWall.tsx` | 67 | `Start 2 weeks free` | `words.cta` |
| `components/monologue/v2/ReadGate.tsx` | 66 | same | same |
| `app/(platform)/checkout/page.tsx` | 270, 325, 385, 388, 395, 459 | "Two weeks, on me." and "$0 for 14 days" | `${cap(words.span)}, on me.` and `$0 for ${words.days} days` |
| `app/(platform)/billing/page.tsx` | 207 | "Two weeks of Plus, free" | `${cap(words.span)} of Plus, free` |
| `app/(platform)/monologues/page.tsx` | 2203 | "2 weeks of Plus, free" | `${words.span} of Plus, free` |
| `app/(platform)/scenes/[id]/rehearse/page.tsx` | 2629 | "Plus, two weeks free" | `Plus, ${words.span} free` |
| `app/(marketing)/pricing/page.tsx` | 64 | "then 2 weeks of Plus free" | "then a week of Plus free, two if you finish a scene" |
| `components/landing/LandingPricing.tsx` | 25 | same | same |

`cap` is `(s) => s[0].toUpperCase() + s.slice(1)`, exported from `lib/trial.ts`.

- [ ] **Step 1:** In each platform file, `const words = useTrialWords();` and replace the strings as the table says.
- [ ] **Step 2:** Under the CTA on `MonologueWall`, `ReadGate`, `UpgradeModal` and the checkout ticket, when `!words.earned`, add one quiet line linking to `/practice`:

```tsx
{!words.earned && (
  <Link href="/practice" className="t-wall__quiet">
    finish a scene first and it&rsquo;s two weeks
  </Link>
)}
```

- [ ] **Step 3:** On the scene review screen, the completion card's body when the trial has just been earned (`firstRun`):

```tsx
body={
  firstRun
    ? "That was my script, not yours. Finishing it just earned you a second free week of Plus. Bring your own sides in and run them the same way."
    : "That was my script though, not yours. Upload your own sides and run them the same way, with the same partner."
}
```

After a finished scene, call `mutate()` from `useSubscription()` so `trial_days` refetches before the card prints its CTA.

- [ ] **Step 4: Verify** — `git grep -n -i -E "2 weeks|two weeks|14 days" -- app components | grep -v admin` returns only the admin comp presets and comments.
- [ ] **Step 5: Run** `npx tsc --noEmit && npm test && npm run lint`
- [ ] **Step 6: Look at it.** Run the app, open `/checkout?tier=plus&period=monthly&trial=1` as a free account that has not rehearsed (expect "A week, on me."), finish the guided scene, reload (expect "Two weeks, on me.").
- [ ] **Step 7: Commit** platform files and marketing files **separately**, so the marketing commit can wait for Canberk.

### Task B5: The email link (needs Canberk)

The reply-CURTAIN Stripe link `00w8wR4Xqd7o7JGa3X6g802` runs 14 days. Two options:

- **Keep it.** Emails keep saying 2 weeks, the app says 1 or 2. Nothing to build. Recommended for now: the email offer is a personal one and volume is a handful a month.
- **Add a 7-day link.** Create it in Stripe (Plus $99/yr, 7-day trial), then update CLAUDE.md's "Trial-link CTA" section and the three-link table.

- [ ] **Step 1:** Canberk picks. If the second, create the link with the Stripe connector, then edit CLAUDE.md.

---

# Phase C: Asks

Three walls exist. The ask is shown at three moments (scene finished, monologue finished, six lines in), to anyone at most four times ever, with 48 hours between any two. That is why 9 people saw a price in two days. This phase adds two asks with real traffic and loosens the limiter to per-gate.

### Task C1: Eligibility as pure rules

**Files:**
- Create: `lib/paywall/eligibility.ts`
- Test: `lib/paywall/eligibility.test.ts`

Rules: a gate shows at most once per 24 hours; a dismissed gate stays quiet 7 days; a gate stops after 4 lifetime shows; 3 dismissals in one browser session silence every gate for that session; a click on any CTA silences every gate.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { canShow, EMPTY_STORE, recordDismiss, recordShow, type Store } from "./eligibility";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = 1_800_000_000_000;

describe("canShow", () => {
  it("shows a gate nobody has seen", () => {
    expect(canShow(EMPTY_STORE, "third_save", T0, 0)).toBe(true);
  });
  it("holds a gate for 24 hours after a show", () => {
    const s = recordShow(EMPTY_STORE, "third_save", T0);
    expect(canShow(s, "third_save", T0 + 23 * HOUR, 0)).toBe(false);
    expect(canShow(s, "third_save", T0 + 25 * HOUR, 0)).toBe(true);
  });
  it("does not let one gate silence another", () => {
    const s = recordShow(EMPTY_STORE, "third_save", T0);
    expect(canShow(s, "reads_meter", T0 + HOUR, 0)).toBe(true);
  });
  it("holds a dismissed gate for 7 days", () => {
    const s = recordDismiss(recordShow(EMPTY_STORE, "third_save", T0), "third_save", T0);
    expect(canShow(s, "third_save", T0 + 6 * DAY, 0)).toBe(false);
    expect(canShow(s, "third_save", T0 + 8 * DAY, 0)).toBe(true);
  });
  it("stops a gate after 4 shows", () => {
    let s: Store = EMPTY_STORE;
    for (let i = 0; i < 4; i++) s = recordShow(s, "third_save", T0 + i * 2 * DAY);
    expect(canShow(s, "third_save", T0 + 30 * DAY, 0)).toBe(false);
  });
  it("goes quiet for the session after 3 dismissals", () => {
    expect(canShow(EMPTY_STORE, "third_save", T0, 3)).toBe(false);
    expect(canShow(EMPTY_STORE, "third_save", T0, 2)).toBe(true);
  });
  it("stops everything once they have clicked through", () => {
    expect(canShow({ ...EMPTY_STORE, clicked: true }, "third_save", T0, 0)).toBe(false);
  });
  it("reads the old single-counter store as empty", () => {
    const old = { shows: 4, lastShownAt: T0, quietUntil: 0, clicked: false } as unknown as Store;
    expect(canShow(old, "third_save", T0 + HOUR, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```ts
/**
 * When a price may be shown. Pure: the caller owns the clock and the storage.
 *
 * Replaces the single counter in TrialOffer.tsx (4 shows ever, 48h between any
 * two, shared by every trigger). Under it a scene-finished ask on Monday
 * silenced the monologue ask on Tuesday, and 9 people saw a price in the first
 * two days anything counted them.
 */

export type GateState = { shows: number; lastShownAt: number; quietUntil: number };
export type Store = { gates: Record<string, GateState>; clicked: boolean };

export const EMPTY_STORE: Store = { gates: {}, clicked: false };

export const GATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SHOWS_PER_GATE = 4;
export const MAX_SESSION_DISMISSALS = 3;

const NEW_GATE: GateState = { shows: 0, lastShownAt: 0, quietUntil: 0 };

export function canShow(store: Store, gate: string, now: number, sessionDismissals: number): boolean {
  if (store.clicked) return false;
  if (sessionDismissals >= MAX_SESSION_DISMISSALS) return false;
  const g = store.gates?.[gate] ?? NEW_GATE;
  if (g.shows >= MAX_SHOWS_PER_GATE) return false;
  if (now < g.quietUntil) return false;
  return now - g.lastShownAt >= GATE_COOLDOWN_MS;
}

export function recordShow(store: Store, gate: string, now: number): Store {
  const g = store.gates?.[gate] ?? NEW_GATE;
  return {
    clicked: store.clicked ?? false,
    gates: { ...(store.gates ?? {}), [gate]: { ...g, shows: g.shows + 1, lastShownAt: now } },
  };
}

export function recordDismiss(store: Store, gate: string, now: number): Store {
  const g = store.gates?.[gate] ?? NEW_GATE;
  return {
    clicked: store.clicked ?? false,
    gates: { ...(store.gates ?? {}), [gate]: { ...g, quietUntil: now + DISMISS_COOLDOWN_MS } },
  };
}
```

- [ ] **Step 3: Run** `npm test`, expect PASS
- [ ] **Step 4: Commit** — `git commit -m "Paywall eligibility: per gate, as pure rules"`

### Task C2: `useTrialOffer` uses them

**Files:**
- Modify: `components/billing/TrialOffer.tsx`, `lib/analytics.ts` (`TrialOfferTrigger`)

- [ ] **Step 1:** Extend the trigger type: `| "third_save" | "reads_meter"`.
- [ ] **Step 2:** In `TrialOffer.tsx` delete `MAX_LIFETIME_SHOWS`, `COOLDOWN_MS`, `DISMISS_COOLDOWN_MS`, `OfferState`, `EMPTY`. Storage key becomes `actorrise_paywall_v2` (the old key is left to expire unread). `readState` returns `Store`; `writeState` takes a whole `Store`. Session dismissals live in `sessionStorage` under `actorrise_paywall_dismissals`.
- [ ] **Step 3:** `eligible` becomes `!isLoading && isFree && canShow(snapshot.store, trigger, snapshot.now, snapshot.sessionDismissals)`. The show effect writes `recordShow(readState(), trigger, Date.now())`; `dismiss` writes `recordDismiss(...)` and increments the session counter; `accept` writes `{...readState(), clicked: true}` and calls `trackPaywallCtaClicked(trigger, "ask", tier, variant)`.
- [ ] **Step 4:** `useTrialOffer` takes an optional third argument `variant?: string` and passes it to `trackTrialOfferShown`.
- [ ] **Step 5: Run** `npx tsc --noEmit && npm test`
- [ ] **Step 6: Commit** — `git commit -m "The ask is limited per gate, not once for all of them"`

### Task C3: Copy

**Files:**
- Create: `lib/paywall/copy.ts`
- Test: `lib/paywall/copy.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { GATE_COPY } from "./copy";

describe("GATE_COPY", () => {
  it("has no dashes and no we", () => {
    for (const [gate, c] of Object.entries(GATE_COPY)) {
      const text = `${c.headline} ${c.body}`;
      expect(text, gate).not.toMatch(/[—–]/);
      expect(text, gate).not.toMatch(/\b(we|our|us)\b/i);
    }
  });
  it("gives every gate a variant id", () => {
    for (const c of Object.values(GATE_COPY)) expect(c.variant).toMatch(/^[a-z_]+_[a-z]$/);
  });
});
```

- [ ] **Step 2: Implement.** Draft copy, for Canberk to edit:

```ts
/**
 * What each ask says. Two lines, about the thing the actor was just doing.
 * `variant` is logged on paywall_hit so a rewrite can be read against the old
 * one: change the words, change the letter.
 */

export type GateCopy = { variant: string; headline: string; body: string };

export const GATE_COPY = {
  third_save: {
    variant: "third_save_a",
    headline: "Three pieces. That's a book.",
    body: "Plus lets you cut each one to time and run it out loud with a partner who never gets tired.",
  },
  reads_meter: {
    variant: "reads_meter_a",
    headline: "",
    body: "{left} free {reads} left this month. Plus opens every piece.",
  },
  scene_completed: {
    variant: "scene_completed_a",
    headline: "Nice run.",
    body: "That was my script though, not yours. Upload your own sides and run them the same way, with the same partner.",
  },
  monologue_completed: {
    variant: "monologue_completed_a",
    headline: "Keep the stage.",
    body: "Free runs are capped. Plus takes the cap off and lets you bring your own sides in to rehearse the same way.",
  },
  lines_delivered: {
    variant: "lines_delivered_a",
    headline: "",
    body: "Want to run your own sides like this?",
  },
} satisfies Record<string, GateCopy>;
```

- [ ] **Step 3:** The three existing call sites read their strings from `GATE_COPY` and pass `variant` to `useTrialOffer`.
- [ ] **Step 4: Commit** — `git commit -m "Ask copy in one file, with a variant id on every show"`

### Task C4: The third save

**Files:**
- Modify: `hooks/useBookmarks.ts` (expose the count after a save), the platform layout that hosts global strips
- Create: `components/billing/SaveAsk.tsx`

Reach: 97 free users hold 3+ saves, 75 crossed 4 in the last 30 days.

- [ ] **Step 1:** `SaveAsk` mounts once in the platform layout. It reads `useBookmarkCount()` and keeps the previous count in a ref. `active` is true for the render where the count goes from 2 to 3 or from 3 to 4 (a save, never a page load).

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useBookmarkCount } from "@/hooks/useBookmarks";
import { GATE_COPY } from "@/lib/paywall/copy";
import { TrialOfferBanner, useTrialOffer } from "./TrialOffer";

/** The ask after a third save: the actor has just built something worth keeping. */
export function SaveAsk() {
  const { count, isLoading } = useBookmarkCount();
  const previous = useRef<number | null>(null);
  const [crossed, setCrossed] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const before = previous.current;
    previous.current = count;
    // null is the first load: holding three saves is not the same as saving one.
    if (before !== null && count > before && (count === 3 || count === 4)) setCrossed(true);
  }, [count, isLoading]);

  const copy = GATE_COPY.third_save;
  const offer = useTrialOffer("third_save", crossed, copy.variant);
  if (!offer.visible) return null;
  return (
    <TrialOfferBanner
      body={`${copy.headline} ${copy.body}`}
      href={offer.href}
      onAccept={offer.accept}
      onDismiss={offer.dismiss}
    />
  );
}
```

`useTrialOffer` snapshots eligibility at mount, which is what a layout-level component needs: one decision per page life.

- [ ] **Step 2:** Mount `<SaveAsk />` in `app/(platform)/layout.tsx` beside the existing global strips.
- [ ] **Step 3: Look at it.** Free account with 2 saves, save a third: the strip appears above the phone tab bar. Dismiss, save a fourth: nothing (7 days quiet).
- [ ] **Step 4: Commit** — `git commit -m "An ask after the third save"`

### Task C5: The reads meter

**Files:**
- Create: `components/billing/ReadsLeft.tsx`
- Modify: the monologue reading page that renders `ReadGate` / `MonologueWall`

Reach: 87 users read 3+ pieces this month, 65 read 4+, 39 hit the wall at 5. The wall is the first time any of them learn there was a limit.

- [ ] **Step 1:** `useUsageLimits()` already returns `monologue_reads_used` and `monologue_reads_limit` from `/api/subscriptions/usage`; add both to the `UsageLimits` type in `hooks/useSubscription.ts`.
- [ ] **Step 2:**

```tsx
"use client";

import { useUsageLimits } from "@/hooks/useSubscription";
import { GATE_COPY } from "@/lib/paywall/copy";
import { TrialOfferBanner, useTrialOffer } from "./TrialOffer";

/** Says how many free reads are left, from the third read on. */
export function ReadsLeft() {
  const { usage } = useUsageLimits();
  const limit = usage?.monologue_reads_limit ?? -1;
  const left = limit < 0 ? -1 : limit - (usage?.monologue_reads_used ?? 0);
  const active = left === 1 || left === 2;

  const copy = GATE_COPY.reads_meter;
  const offer = useTrialOffer("reads_meter", active, copy.variant);
  if (!offer.visible) return null;
  const body = copy.body
    .replace("{left}", String(left))
    .replace("{reads}", left === 1 ? "read" : "reads");
  return (
    <TrialOfferBanner body={body} href={offer.href} onAccept={offer.accept} onDismiss={offer.dismiss} />
  );
}
```

- [ ] **Step 3:** Mount on `app/(platform)/monologue/[id]/page.tsx`, not in the search panel.
- [ ] **Step 4: Commit** — `git commit -m "The reads meter: the limit is said before it is hit"`

### Phase C verification

```sql
select properties->>'gate' gate, properties->>'kind' kind,
       count(*) hits, count(distinct user_id) users
from user_events
where event_name = 'paywall_hit' and created_at > now() - interval '7 days'
group by 1, 2 order by 3 desc;
```

Seven days after deploy: at least 4 gates with rows, 25+ distinct users.

---

# Phase D: Triggered emails

### Task D1: Widen `touch`

**Files:**
- Create: `backend/scripts/widen_lifecycle_touch.sql`
- Modify: `backend/app/models/lifecycle_email.py` (`String(16)` to `String(32)`, comment lists the new touches)

```sql
-- checkout_abandoned (18), trial_ended_no_pay (18), paywall_seen_no_trial (21)
-- do not fit varchar(16). Widening a varchar is a catalog change, no rewrite.
alter table public.lifecycle_email_sends alter column touch type varchar(32);
```

- [ ] Apply on Supabase **before** the code deploys.

### Task D2: Selection

**Files:**
- Create: `backend/app/services/email/triggered.py`
- Test: `backend/tests/test_triggered_emails.py`

| touch | anchor | wait | window | cancelled by |
|---|---|---|---|---|
| `checkout_abandoned` | `checkout_started` | 2h | 24h | a later `checkout_completed` |
| `trial_ended_no_pay` | `trial_ended`, outcome not `converted` | 24h | 72h | an active paid subscription |
| `paywall_seen_no_trial` | first `paywall_hit` in the window | 24h | 72h | a later `checkout_started` |

Priority is that order. Rules shared with `lifecycle.py` are imported from it, not copied: `_mailable`, `_paid_user_ids`, `_claim`.

**The do-not-contact exception.** `handle_checkout_completed` adds every checkout, trials included, to `email_do_not_contact` with reason `paid_subscriber`. So everyone who could ever receive `trial_ended_no_pay` is on the list. For that touch only, a row whose reason is exactly `paid_subscriber` does not block. Every other reason blocks, always.

**The weekly cap.** Before claiming, count the user's `lifecycle_email_sends` rows in the last 7 days. Two or more: skip. This counts day3 and day10 as well, so the cap is one number across both jobs.

Public interface:

```python
TRIGGERS: dict[str, Trigger]            # touch -> anchor, wait_hours, window_hours
PRIORITY: tuple[str, ...]               # send order

def select_candidates(db, touch: str, now: datetime | None = None) -> list[dict]
def sends_in_last_week(db, user_id: int, now: datetime) -> int
def run_touch(touch: str, *, send: bool = False, cap: int = 50) -> dict
def run_all(*, send: bool = False) -> list[dict]
```

Tests, one per rule, in the `test_lifecycle_emails.py` style (in-memory DB with `Organization, User, UserEvent, EmailDoNotContact, LifecycleEmailSend`; `_paid_user_ids` patched):

- [ ] `test_checkout_abandoned_waits_two_hours` (1h old: no, 3h old: yes, 30h old: no)
- [ ] `test_a_finished_checkout_cancels_it`
- [ ] `test_converted_trial_gets_no_email`
- [ ] `test_paid_subscriber_dnc_does_not_block_trial_ended`
- [ ] `test_any_other_dnc_reason_blocks_every_touch`
- [ ] `test_wall_then_checkout_gets_no_wall_email`
- [ ] `test_weekly_cap_counts_day3_and_day10`
- [ ] `test_one_person_gets_the_highest_priority_touch_only`
- [ ] `test_a_touch_is_sent_once`
- [ ] `test_opted_out_and_staff_are_skipped`

### Task D3: Copy, for Canberk to approve

**Files:**
- Create: `backend/emails/lifecycle/checkout_abandoned.txt`, `trial_ended_no_pay.txt`, `paywall_seen_no_trial.txt`
- Modify: `backend/app/services/email/templates.py` (`render_triggered_plain(touch, user_name, link, trial_span)` reads the file, fills `{name}`, `{link}`, `{span}`)

Written with the `draft-actorrise-email` skill. Plain text, 3 to 5 sentences, one link, lowercase like day3 and day10, ending:

```
canberk

reply unsubscribe and i'll take you off the list, no hard feelings.
```

The link carries `?e=<touch>`.

- [ ] Canberk reads all three. Nothing in D4 is switched on before that.

### Task D4: Switch and schedule

**Files:**
- Modify: `backend/app/services/app_settings.py` (`TRIGGERED_EMAILS_ENABLED = "triggered_emails_enabled"`, default false), `backend/app/main.py` (the lifecycle loop calls `triggered.run_all(send=True)` when the flag is on, before `lifecycle.run_all`, so money touches claim their share of the weekly cap first), `app/(platform)/admin/emails/page.tsx` (a second toggle), `backend/app/api/admin/emails.py`
- Create: `backend/scripts/triggered_emails.py` (CLI preview, the twin of `scripts/lifecycle_emails.py`)

`lifecycle.select_candidates` gains the weekly-cap check so day3 and day10 respect it too.

### Task D5: `email_sent`, `email_clicked`

- [ ] `record_user_event(user_id, "email_sent", {"touch": touch})` after every successful send in `lifecycle.run_touch` and `triggered.run_touch`.
- [ ] `components/EmailClickBeacon.tsx`, mounted in the platform layout: reads `?e=`, fires `trackEvent("email_clicked", {touch})` once, strips the parameter with `router.replace`. A logged-out click is lost; that is accepted.

### Phase D verification

```sql
select touch, count(*), max(sent_at) from lifecycle_email_sends
where sent_at > now() - interval '7 days' group by 1;

select user_id, count(*) from lifecycle_email_sends
where sent_at > now() - interval '7 days' group by 1 having count(*) > 2;  -- zero rows
```

---

# Phase E: The daily loop

What "agents" means here. Two things send on their own: nothing personal, only the three approved templates in Phase D. Everything written to one person is drafted by the agent and sent by Canberk. That is the rule in CLAUDE.md, and it is also what has worked: every conversion on record came out of a plain exchange with him.

### Task E1: The brief

**Files:**
- Create: `backend/scripts/conversion_brief.py`

Read-only (`default_transaction_read_only=on`). Prints markdown:

1. `funnel_daily` for the last 7 days, and the 7 before.
2. **Walked away yesterday:** real free users with a `paywall_hit` and no `checkout_started` since. One line each: name, email, signup date, gate, and what they did (saves, reads, scenes, last search).
3. **In a trial:** Stripe trials, days left, whether they have rehearsed since starting.
4. **Emails:** sent and clicked by touch, 7 days.
5. **Write to these five:** from list 2, ranked by activity, excluding do-not-contact, opted out, and anyone emailed in the last 7 days.

### Task E2: The run

**Files:**
- Create: `.claude/commands/conversion-loop.md`

The command tells the agent to:

1. Run `conversion_brief.py`, save to `outputs/conversion/YYYY-MM-DD.md`.
2. Read the inbox (Gmail connector) for replies since the last run.
   - **UNSUBSCRIBE, stop, no thanks:** add to `email_do_not_contact` with a dated reason. Done without asking; CLAUDE.md says right away.
   - **CURTAIN:** draft a reply. The Stripe link is left for Canberk to paste, because the connector wraps every URL.
   - **Anything else:** draft a reply in his voice, and append the actor's words to `docs/metrics/user-voice.md` with the date and what they were doing in the product.
3. For the five in the brief, draft one short personal email each as a Gmail draft (`htmlBody` only, `actorrise<span>.</span>com`). About what they did, not about Plus.
4. End with a summary: numbers against yesterday, drafts waiting, anything broken.

It never sends, never posts, never pushes.

### Task E3: Founder outreach (spec Step 4)

**Files:**
- Create: `backend/scripts/outreach/heavy_users.sql`, `bounced_users.sql`, `backend/scripts/outreach/export.py`
- Modify: `.gitignore` (add `outreach/founder/`)

- [ ] `.gitignore` first. The CSVs carry emails.
- [ ] Heavy: top 30 by favorites + rehearsal sessions + searches, 30 days, free, opted in, not on the list. Pool today: 343, of whom 44 score 10+.
- [ ] Bounced: onboarded, signed up 7 to 30 days ago, no search after day 1. Pool today: 202. 183 already had day3 or day10, so this is their third email; the draft says so plainly.
- [ ] Two drafts with the `draft-actorrise-email` skill, to `outreach/founder/heavy.md` and `bounced.md`. Canberk sends by hand.

### Task E4: Running it every day

- [ ] Canberk runs `/conversion-loop` each morning, or `/loop 24h /conversion-loop` in a session left open. A cloud routine cannot reach the database from here; if this earns its keep, the brief moves behind an admin endpoint and the run moves to the cloud.

---

## Definition of done

- [ ] `funnel_daily` live, returning the whole funnel
- [ ] Every wall and ask logs `paywall_hit` with gate, kind and, for asks, variant
- [ ] Trial is 7 days, 14 for an actor who has finished a scene, and every surface prints the right one
- [ ] Two new asks live (third save, reads meter); limiter is per gate
- [ ] Three triggered emails running with the weekly cap, copy approved by Canberk
- [ ] `/conversion-loop` produces a brief and drafts
- [ ] Two founder outreach lists and drafts generated
- [ ] This file updated with what shipped and baseline against week 1

Phase 2 (partner outreach agents, B2B prospecting) waits until `price_seen` shows 100+ distinct users in a 30-day window.

## Held, with the reason

| Thing | Why held | What would reopen it |
|---|---|---|
| Save cap at 3 | Saving anchors every return email; 82 users already over | Asks convert under 1% after 30 days |
| Cut editor and notes walls | 8 and 9 users a month | Either passes 50 users a month |
| `three_saves`, `unfinished_cut`, `dormant_book` emails | Same population that ignored day3 and day10 | A money touch shows a click rate above 5% |
| Server-side impression table | localStorage plus `paywall_hit` rows answer every question asked so far | An actor reports being asked on two devices |

## Shipped log

On `feat/conversion-phase1`, merged 2026-09-29. The three commits of `feat/mobile-first-run` went in with it.

| Date | Commit | What |
|---|---|---|
| 2026-09-29 | `a9be605f` | Conversion phase 1: the spec checked against prod, and the plan |
| 2026-09-29 | `88fd71fb` | The money path gets names for every step, and the webhook writes the two it knows |
| 2026-09-29 | `07a8f6cc` | Every price shown is a paywall_hit |
| 2026-09-29 | `74dd62c8` | funnel_daily: the money path as one view |
| 2026-09-29 | `2c90524a` | The trial is a week, two for an actor who has finished a scene |
| 2026-09-29 | `1306559c` | The second week is the server's to grant, never the browser's |
| 2026-09-29 | `44956951` | Every price prints the trial the actor has earned |
| 2026-09-29 | `4c9e805b` | Pricing and landing: a week of Plus free, two if you finish a scene |
| 2026-09-29 | `42667501` | Two new asks, and the limiter counts per gate |
| 2026-09-29 | `d90a05b3` | Three emails for people who looked at a price, off until the copy is approved |
| 2026-09-29 | `7034507e` | The daily loop: a brief, a run that drafts and never sends, and two founder lists |

## Baseline, to read week 1 against

Taken 2026-09-29 from prod. Real users only.

| | Value | Note |
|---|---|---|
| Saw a price, 7 days | 9 | counting began 2026-09-27, so this is 2 days |
| Started checkout, 7 days | 1 | |
| Started a trial, 7 days | 0 | `trial_started` was GA4 only until this branch |
| Paid, 7 days | 0 | 2 in the 7 before |
| Signed up, 7 days | 120 | 127 before |
| Onboarded, 7 days | 52 | 75 before |
| Searched, 7 days | 68 | 84 before |
| Worked a monologue, 7 days | 22 | 32 before |
| Stripe trials running | 5 | 34 more are manual comps |
| Free users holding 3+ saves | 97 | the third-save ask's pool |
| Read 3+ pieces this month | 87 | the reads meter's pool |
| day3 + day10 sent, 7 days | 217 | clicks uncounted until the beacon deploys |
