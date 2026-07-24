# ActorRise — Project Log

A running, version-controlled record of what's been built and why. Committed to
git so it's durable and portable (my session memory lives in Claude Code's local
memory folder; this doc is the shared, permanent copy). Newest entries on top.

---

## 2026-07-24 — Community feature ("Callboard" feed) + monetization prep

**Shipped to `main` (Vercel + Render auto-deploy). Supabase migration applied
before the code push (correct deploy order).**

### The feature
A public, semi-anonymous activity feed that makes the app feel alive and funnels
into the paywall. Full design: `docs/plans/2026-07-24-community-feed-design.md`.

- **DB**: `community_events` table (`id, user_id FK, event_type, payload jsonb,
  created_at`) + `users.share_activity` opt-out. Backfilled 33 real events from
  existing tables so it launched populated (reversible: `DELETE FROM community_events`).
- **Backend**: `record_event()` (fire-and-forget, hard payload whitelist so a raw
  search query can never enter the feed), `GET /api/community/feed` (public;
  `anonymize=true` masks names + drops faces for logged-out use), `GET/PATCH
  /api/community/settings` (opt-out). Live hooks: signup, search (intent-only),
  bookmark, went_plus. 9 unit tests.
- **Where it lives now** (after a placement rework based on Canberk's feedback):
  - `/practice` (post-login landing): ambient Callboard **right-rail** on desktop,
    stacks below on mobile.
  - `/callboard`: the full feed page (reached via "see everything", not a nav tab).
  - Landing page: a logged-out **teaser** (masked/blurred names, no faces) →
    "Join to see who's in the room" → signup.
  - `/monologues`: NOT the social feed — the pre-search space shows **trending
    pieces** (task-serving), and the raw feed/ticker were removed to keep the
    search page focused.

### Key decisions
- Feed window widened 48h → 7 days (real volume ~4-5 events/day made 48h a ghost
  town). Live counter still says "today", widens to "this week" when thin.
- "The Green Room" name is **reserved** for the real collaboration feature (two
  actors rehearsing a scene together) — NOT the feed. The feed is "the Callboard".
- Privacy by construction: payload whitelist blocks raw queries; opt-out filters
  at read time (retroactive); logged-out teaser gets masked names + no headshots.

### Commits
`fa4bc976` core feed · `e7845d66` opt-out · `74ac53c2` Callboard pivot ·
`b4c52e95` /monologues pre-search+ticker · `8d79ceac` trending + feed-to-rail ·
`36ee6e14` landing teaser.

### Next
1. **Monetize** (Canberk's priority, before Green Room) — direction TBD; mapping
   the current paywall/trial surface to pick the highest-leverage conversion work.
2. **The Green Room** — collaboration/participation (two actors rehearse a scene
   together, live and/or async). Big feature, needs its own design/brainstorm.
