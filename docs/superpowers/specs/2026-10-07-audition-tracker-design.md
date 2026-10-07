# Audition Tracker (web v1) design

Date: 2026-10-07. Status: approved in brainstorm, awaiting spec review.

## Why

Sep 7 to Oct 7, 2026: 1,374 users, 88% finish onboarding, 82% search, but only 82 weekly actives, 3 to 17 returning users a week, 984 dormant, 17.5% ever rehearse. Search is a once-per-audition need and nothing the actor owns lives in the app (docs/metrics/hypotheses.md H-14). Working actors audition every week. A tracker that is wired into prep gives them a weekly reason to come back, and every upcoming audition gives us an honest reason to email.

**Success:** returning users per week move from about 10 toward 40+ over 3 to 4 weeks after launch, measured with the new engaged WAU (see Measurement).

## Decisions made

| Topic | Decision |
|---|---|
| Center of v1 | The prep room. Tracking is a byproduct of preparing. |
| Platform | Web first. Ghost Light gets a tab and push only after the web numbers move. API shaped so it can. |
| Navigation | Context-aware landing (below) plus a fourth nav tab, Auditions. |
| Capture | One drop box: paste text and/or drop a sides PDF, AI pre-fills a card the actor confirms. Manual form as a link. |
| Sides | A dropped PDF becomes a ScenePartner script automatically, linked to the audition. |
| Self-tape | Only an audition kind with a deadline. No recording, no video upload. A plain tape link text field. |
| Reminders | Three emails per audition, own lane, max one audition email per user per day. |
| Free vs Plus | Tracker and reminders free and unlimited. AI parse 5/month free, unlimited Plus. Recs and rehearsal ride the existing walls. Insights are a Plus teaser. |
| Launch | Staged: in-product week 1, one founder email to dormant opted-in users week 2, onboarding step. |
| Measurement | Keep usage_metrics WAU, add engaged WAU from user_events, add Auditions admin panel. |
| Data model | Three tables: auditions, audition_pieces, audition_events. |
| Visual | The ticket rail (option B). Rail is the pipeline, the opened ticket is the prep room. |
| LLM | Stay on OpenAI gpt-4o-mini via the existing get_llm() JSON mode. No provider switch. |

## Out of scope for v1

Insights beyond the teaser, forward-to-email capture, two-way calendar sync, in-app notification center, a contacts table, Ghost Light tab and push, any video storage.

## Data model

New raw SQL migration `backend/scripts/add_auditions_tables.sql` (repo pattern, no Alembic), model file `backend/app/models/audition.py`, exported from `app/models/__init__.py`. RLS enabled on all three tables with no anon policies (backend uses the service connection), matching the 2026-08-23 lockdown.

The existing `app/models/audition_usage.py` and `/api/audition` belong to the self-tape recorder. The new code uses the plural `auditions` everywhere to stay clear of it.

### auditions

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | int FK users, indexed | |
| project | text not null | "The Glass Menagerie" |
| role | text | "Laura Wingfield" |
| kind | text not null | `in_person`, `self_tape`, `virtual` |
| status | text not null | `submitted`, `scheduled`, `callback`, `booked`, `pinned`, `passed` |
| starts_at | timestamptz | appointment time (in_person, virtual) |
| due_at | timestamptz | tape deadline (self_tape) |
| tz | text not null | IANA zone from the browser at creation, used for reminder timing and display |
| location | text | |
| casting | text | casting director or office, free text |
| casting_key | text, indexed | lowercased, punctuation stripped, for grouping |
| material_raw | text | "1 min contemporary comedic" as written |
| material | jsonb | parsed: `{length_seconds, genre, era, style, count}` any may be null |
| bring | text | "sides, headshot, resume" |
| notes | text | |
| tape_link | text | URL string only |
| source | text not null | `parse`, `manual`, `onboarding` |
| user_script_id | int FK user_scripts, nullable | sides, when dropped |
| reminders_on | bool default true | per-audition mute |
| outcome_token | text unique | random, for one-tap outcome links in email |
| created_at, updated_at | timestamptz | |
| deleted_at | timestamptz | soft delete so events stay joinable |

"Upcoming" = `coalesce(starts_at, due_at) >= now()`. The event moment `when = coalesce(starts_at, due_at)`. An audition with neither date is allowed (status `submitted`) and sits in "Waiting to hear".

### audition_pieces

`id, audition_id FK, monologue_id FK nullable, scene_id FK nullable, used bool default false, created_at`. Exactly one of monologue_id or scene_id set. `used` drives "which pieces got callbacks" later.

### audition_events

Append-only: `id, audition_id FK, user_id, kind, data jsonb, created_at`. Kinds: `created`, `status_changed {from,to}`, `outcome_logged {outcome, via}`, `reminder_sent {moment}`, `note_added`. Countdown history, the ticket timeline and admin metrics read this. It is not a replacement for user_events; both are written.

## API

New router `backend/app/api/auditions.py`, prefix `/api/auditions`, `get_current_user`. Plain REST, JSON, no web-only shapes, so Ghost Light can reuse it unchanged.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auditions` | list, `?scope=upcoming|waiting|past`, includes computed `prep` summary per audition |
| POST | `/api/auditions` | create (manual or confirmed parse) |
| GET | `/api/auditions/{id}` | detail with pieces, prep steps, last events |
| PATCH | `/api/auditions/{id}` | edit fields, change status (writes status_changed) |
| DELETE | `/api/auditions/{id}` | soft delete |
| POST | `/api/auditions/parse` | text and/or PDF in, draft card out, nothing saved |
| POST | `/api/auditions/{id}/pieces` | attach a monologue or scene |
| DELETE | `/api/auditions/{id}/pieces/{piece_id}` | detach |
| GET | `/api/auditions/next` | the nearest upcoming audition or null, used by the landing redirect |
| GET | `/api/auditions/outcome/{token}?o=good|callback|no` | public, one-tap outcome from email, redirects to the prep room or a thank-you page |
| GET | `/api/auditions/calendar.ics?k=<feed key>` | public read-only feed |

### Prep summary (computed server side)

For each audition the API returns `prep: {steps: [...], runs: int, last_run_at}`.

- **runs:** completed `RehearsalSession` rows on scenes of `user_script_id`, plus `monologue_work_started` user_events on linked monologues, counted from `created_at`.
- **steps, generated in order:**
  1. If `user_script_id`: "Run the sides" (done when runs >= 1, shows tally).
  2. If `material` or `material_raw`: "Pick your piece", links to `/monologues?q=<material_raw>` plus derived filters, done when a piece is attached.
  3. If neither: "What are you bringing?", picker from the actor's Collection.

Steps are one button into existing routes. No new rehearsal UI.

## AI parsing

`backend/app/services/auditions/parse.py`, using `get_llm(model="gpt-4o-mini")` JSON mode, temperature 0.

- **Input:** pasted text (cap 12k chars) and/or a PDF. For the PDF, extract the first 2 pages of text for header fields (project, role, casting), and hand the whole file to the existing ScenePartner upload path only on save.
- **Prompt:** includes today's date and the actor's tz so "Thursday" resolves to a real date.
- **Output schema:** each field is `{value, confidence: high|low}`: project, role, kind, starts_at (ISO, local), due_at, location, casting, material_raw, material, bring.
- **Validation:** pydantic. Dates in the past or more than 18 months out drop to low confidence. Invalid JSON retries once, then returns an empty draft.
- **UX when wrong:** low-confidence and empty fields are outlined in the card and the cursor lands on the first one. Nothing saves without the actor pressing Save. If the actor edits any parsed field before saving, record `audition_parse_corrected {fields}`.
- **Failure:** model error or timeout (10 s) opens the manual form with whatever text was pasted kept in Notes. Never a dead end.
- **Quota:** 5 parses a month free, counted from `audition_parse_requested` user_events in the calendar month. Over quota, the drop box says so plainly and offers the manual form plus the existing upgrade path. Plus is unlimited. Gate lives in `rate_limiting.py` as `require_audition_parse`, following the FeatureGate pattern.

## Sides into ScenePartner

On save with a PDF, the backend calls the same service the `/api/scripts/upload` route uses, then sets `auditions.user_script_id`. If extraction fails, the audition still saves and the prep step reads "Sides did not load, try again" with a retry. Existing ScenePartner tier limits apply unchanged.

## Frontend

### Route and navigation

- New route `app/(platform)/auditions/page.tsx`, with `app/(platform)/auditions/[id]/page.tsx` for the phone full-screen prep room and deep links.
- Add `/auditions` to the `middleware.ts` protected list.
- Add **Auditions** to the single `navItems` array in `app/(platform)/layout.tsx` so desktop appbar and phone tab bar both get it.

### Context-aware landing

After login, if `GET /api/auditions/next` returns an audition within the next 14 days, go to `/auditions/<id>`. Otherwise keep today's destination (`/rehearse` after login, `/practice` after signup). An explicit `?redirect=` always wins. Log `audition_landing_shown`. `/rehearse` and `/monologues` get a slim strip, "Got an audition coming up? Add it", for users with zero upcoming auditions. It is dismissible, and the dismissal is remembered per user.

### Layout (approved option B)

- **Desktop:**
  - Left column (about 360px): the drop box on top, then the rail grouped into *Coming up* (sorted by when), *Waiting to hear* (date passed, status not booked/passed), and a collapsed *Past*.
  - The selected ticket slides out 8px with an orange stub.
  - Right: the prep room as an enlarged ticket. A big stub carries the countdown number, the unit (days, or hours under 48h), and the date and time. The body holds project, role, where/casting/bring rows in the direction font, prep steps, and status chips.
- **Phone:** the rail is the page. Tapping a ticket goes to `/auditions/<id>` full screen, with the stub across the top.
- **Countdown:** days for 2 or more days out, hours under 48h, "Today" and "Tomorrow" words where clearer. Self-tape stubs say "due".

### Theme

The page must work in both house-light modes. Rules:
- Build only from Theatre Walk tokens and classes (`--t-paper`, `--t-ink`, `--t-cream`, `--t-line-*`, `--t-muted-*`, `--t-gel`, `--t-hard-shadow`, `t-ticket`, `t-stub`, `t-cta`, `t-field`).
- Orange via `bg-primary` / `text-primary-foreground` only, never a hex, so dark mode gets `#f27626` with a dark label.
- Fonts via `theatreFontVars` bound on the page: display serif for titles and the countdown, sans for chrome, typewriter only for the call-sheet rows (the font rule allows typewriter for monologue text, and these rows are the one sanctioned exception as a "printed sheet" detail).
- Verify both themes at desktop and 390px before shipping.

### Capture flow

1. The actor pastes and/or drops into the box.
2. "Reading it..." state, then the draft card opens in place with low-confidence fields outlined.
3. On Save, the ticket animates into the rail and the prep room opens.

"or fill it in yourself" opens the same card empty. The browser timezone is sent on create.

### Onboarding step

One optional step in `OnboardingWizard`: "Anything coming up?" with the drop box and a Skip. Creates with `source=onboarding`.

### Empty state

No tickets: a single empty ticket outline in the rail with the drop box above, and a line in Canberk's voice, for example "Paste the next casting email you get. I'll handle the reminders." No dashes in any copy.

## Reminders

Service `backend/app/services/email/audition_reminders.py`, hourly scheduler `_start_audition_reminder_scheduler` in `app/main.py`, gated by `scheduler_status("audition_reminders")` and an `AUDITION_REMINDERS_ENABLED` app_settings switch in `/admin/emails` (default OFF until launch). Sent via Resend like the lifecycle emails.

| Moment | When (actor's tz) | Content |
|---|---|---|
| `prep` | 3 days before `when` at 6pm, or at the next hourly run if created inside 3 days | what is coming, the one next prep step, deep link to it |
| `eve` | day before at 7pm | time, place, bring, run count, "run it once more" link |
| `after` | morning after, 9am | "How'd it go?" with three one-tap links (Felt good, Got a callback, Not this time) using `outcome_token` |

Rules:
- One audition email per user per calendar day in their tz. If two auditions collide, the nearer one wins and the other moment is skipped, not queued.
- Dedupe table `audition_reminder_sends (audition_id, moment)` UNIQUE, claimed before send, as in `lifecycle._claim`.
- Skip if `reminders_on` is false, the audition is deleted, status is booked/passed, or the user is in `email_do_not_contact`.
- These are service emails for dates the actor entered, so they are outside the lifecycle 2-per-week cap and do not count toward it.
- They carry the unsubscribe link (per-audition mute plus a global "stop audition emails" preference), and end on `Canberk`. They are triggered emails in the same family as checkout_abandoned, so no reply-UNSUBSCRIBE line.
- Copy lives in `backend/emails/auditions/*.txt` with the same `subject:` first-line format and the same CopyTests enforcement (no dashes, first person, no corporate phrases).
- Outcome links: `good` keeps status and logs outcome, `callback` sets status callback and opens the prep room to add the new date, `no` sets passed. All write `outcome_logged {via: email}`.

## Calendar feed

Each user gets a random `calendar_feed_key` (new nullable column on users, generated on first request). `GET /api/auditions/calendar.ics?k=` returns upcoming and last-30-days auditions as VEVENTs: title "Callback: The Glass Menagerie (Laura)", location, description with casting, bring, and a link to the prep room. Self-tapes are all-day events on the due date with the time in the title. Read-only. The settings menu offers "Subscribe in Google / Apple Calendar" and "Reset link". Log `calendar_feed_subscribed` when the link is copied.

## Free vs Plus

| | Free | Plus |
|---|---|---|
| Auditions, rail, prep room, countdowns, status | unlimited | unlimited |
| Reminder emails, calendar feed | yes | yes |
| AI parse | 5 per calendar month | unlimited |
| Recs from material | existing 5-read wall | unlimited |
| Rehearse sides | existing ScenePartner limits | existing Plus limits |
| Insights | locked teaser after 5 logged outcomes | full (built after v1) |

The tracker never walls. v1 ships only the teaser card (a blurred callback-rate number with "Plus" label) once a user has 5 outcomes.

## Measurement

### New user_events (add to SERVER/CLIENT_EVENT_NAMES in `app/services/events.py`)

`audition_created {source, kind, has_sides, has_material}`, `audition_parse_requested {has_pdf, has_text}`, `audition_parse_corrected {fields}`, `audition_parse_failed`, `audition_status_changed {from, to}`, `audition_outcome_logged {outcome, via}`, `audition_prep_started {kind: sides|monologue, audition_id}`, `audition_reminder_sent {moment}`, `audition_reminder_clicked {moment}`, `audition_landing_shown`, `audition_strip_clicked {surface}`, `calendar_feed_subscribed`.

Reminder links carry `?ar=<moment>` so the landing logs `audition_reminder_clicked`. The win-back email links carry `utm_campaign=auditions_winback`.

### Admin

- **Growth:** keep the existing `usage_metrics` WAU/MAU/returning untouched. Add **engaged WAU** and **engaged returning per week**, computed from distinct users with any user_event in an engaged set (searches, rehearsal events, all `audition_*` except `audition_reminder_sent`) on a day other than their signup day. Show both lines on one chart.
- **New Auditions panel** in admin, following the one-pulse pattern for any badge:
  - Adoption: users with 1+ auditions, auditions created per week by source, parse vs manual, parse correction rate, parse failure rate.
  - Habit: weekly return rate of tracker users vs non-tracker users from the same signup weeks (weeks 1 to 4).
  - Prep: share of auditions with a prep run before `when`, against the 17.5% baseline.
  - Loop: reminders sent, then clicked, then prep started; outcome response rate by `via`.
  - Win-back: returning users from `auditions_winback` vs organic.
- Log a decision entry in `docs/metrics/decisions.md` at launch with the baseline numbers above.

## Launch (staged)

1. **Week 1:**
   - Ship with `AUDITION_REMINDERS_ENABLED` on, so active users see the tab, strip and landing.
   - Watch parse failures and theme bugs.
2. **Week 2:**
   - Canberk sends one founder email to dormant users with `marketing_opt_in`. Claude drafts it, Canberk sends it from `/admin/emails`.
   - Rules: first person, signed Canberk, reply UNSUBSCRIBE line, no CURTAIN, no offer.
   - One ask: paste your next casting email, with a link straight to the drop box.
3. **Weeks 3 to 5:** measure, no new features.

## Error handling

- Parse failure or timeout opens the manual card with the text kept.
- PDF too large or not a PDF: the existing script upload limits and messages apply.
- No timezone from the browser falls back to UTC, and the card shows the zone so the actor can see it.
- Outcome token invalid or already used: a friendly page linking to `/auditions`, no state change.
- Reminder send failure: the claim row stays and the error is logged. No retry loop, since a late "night before" email is worse than none.

## Testing

- **Backend pytest (`.venv/bin/python -m pytest tests/ -q`):**
  - CRUD and ownership (a user cannot read another user's audition).
  - Prep step generation for each combination.
  - Run counting.
  - Parse schema validation with recorded fixtures (no live model in tests): a Backstage notice, an Actors Access notice, an agent email, garbage text.
  - Quota gate.
  - Reminder scheduling across timezones, including DST, the one-per-day collision rule, dedupe, mute, booked/passed skip and do-not-contact skip.
  - Outcome token flow.
  - ICS output validity.
  - CopyTests on the new templates.
- **Frontend:**
  - Landing redirect logic.
  - Countdown formatting.
  - A render check of `/auditions` and `/auditions/<id>` in light and dark at desktop and 390px, logged in, using the worktree phone-width recipe.
