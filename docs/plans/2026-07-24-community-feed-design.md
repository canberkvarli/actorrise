# Community Feed — "The Green Room" — Design

**Date:** 2026-07-24 · **Status:** Approved by Canberk, ready to build
**Goal:** Make ActorRise feel alive. A public pulse of real activity that triggers FOMO, drives signups, and funnels users into gated features. First phase of the broader community bet (phase 2: async partner rehearsal, phase 3: live 1v1 sessions).

## Decisions (locked)

| Question | Decision |
|---|---|
| First shippable | Feed only. Async partner rehearsal = phase 2, live 1v1 = phase 3 (empty-room risk at ~320 users). |
| Identity | Semi-anon: first name + city + headshot. `share_activity` opt-out flag on profile, **retroactive** (filtered at read time). |
| Search privacy | Raw query text NEVER stored or shown. Feed lines templated from query_optimizer's parsed filters (tone/gender/age_range/era). No clean extraction → no event. |
| Paywall | Feed is free for everyone, incl. a blurred-names teaser on the landing page. Money comes from deep links: every card's action chip walks into existing caps (Free = 3 lifetime rehearsals) and the Plus trial. |
| Live counter | "N actors in the building **today**" — never "right now" (~2 concurrent users would read as dead). Widens to "this week" on dead days. |
| v1 extras | Trending piece (precomputed daily) + today-counter. Parked for v2: founder posts, search-theme pulse, platform milestones, streaks. |

## Competitive note (scenepartner.ai, checked 2026-07-24)

Their "rehearse with friends" is **async** (friend records lines once, you rehearse against the recording) — no live session marketed, **no community feed at all**. Free tier = 3 auditions, Pro $29.99/mo. The feed idea is ours alone. Indexed at ctx source `scenepartner-ai-landing`.

## Event taxonomy

All templated. `payload` holds only whitelisted keys.

| event_type | Feed line | Trigger point |
|---|---|---|
| `joined` | "Maya from Chicago just joined ActorRise" | signup |
| `searched` | "Maya is hunting for a comedic monologue for a woman in her 30s" | search endpoint, after query_optimizer parse; only if ≥1 of tone/gender extracted |
| `viewed` | "Maya is reading Viola's ring speech · Twelfth Night" | monologue detail view |
| `bookmarked` | "Maya saved 'The Glass Menagerie' to her list" | bookmark create |
| `worked` | "Maya just ran a monologue out loud" | /work session start |
| `rehearsed` | "Maya rehearsed a 2-person scene · 22 lines" | rehearse complete |
| `milestone` | "Maya finished her 10th rehearsal" | computed at rehearse complete |
| `went_plus` | "Maya went Plus" | Stripe webhook |
| `trending` | "Viola's ring speech is hot this week · 14 actors reading it" | daily cron, precomputed |

Reality check: volume will be mostly `joined` + `searched` (search is 88% of activity). That's fine — parsed-search lines show *intent*, the strongest FOMO content. Rare rehearse events read as bigger because they're rare.

## Data model

```sql
CREATE TABLE community_events (
  id          bigserial PRIMARY KEY,
  user_id     bigint REFERENCES users(id),   -- NULL for aggregate events (trending)
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_events_created ON community_events (created_at DESC);

ALTER TABLE users ADD COLUMN share_activity boolean NOT NULL DEFAULT true;
```

**Payload whitelist** (validated at write; unknown keys dropped): `tone`, `gender`, `age_range`, `era`, `monologue_id`, `title`, `source_type`, `line_count`, `milestone_n`, `reader_count`.

**Privacy by construction:** the writer physically cannot store a raw query. Display name/city/headshot are joined from the profile at READ time (never denormalized), so the opt-out hides a user's entire history instantly. The API returns `{name, city, headshot_url, event_type, payload, created_at}` — no user ids, no emails.

## Backend

- **`record_event(user_id, event_type, **fields)`** — tiny helper, fire-and-forget: validates whitelist, swallows ALL errors, never blocks or slows the calling request. Wired into: signup, search (post-parse), monologue view, bookmark, /work start, rehearse complete, Stripe webhook.
- **`GET /api/community/feed`** — one indexed query: last 48h, LIMIT 100, single join on `users.share_activity = true`. ~10KB payload. No request-time aggregation.
- **Today-counter** — `count(distinct user_id)` over today's events; cheap at this volume, can be cached 5 min later if needed.
- **Trending** — daily job picks the most viewed+bookmarked monologue, inserts one `trending` event with `reader_count`. Never computed on page load.
- **Realtime** — Supabase Realtime on `community_events` INSERT. Client subscribes; zero polling. (Enable replication for the table in Supabase.)

## Frontend

**Placement:** `/community` ("Green Room") in platform nav + 3-event ticker on platform home + logged-out landing teaser (real events, **blurred names**, "join to see who's in the room").

**Look — stage door at half-hour:** darkest Ghost Light surface, single center column like a callboard.
- Cards: sharp corners (informational), headshot with warm rim-glow (glowing initial-disc fallback), name+city in sans, **piece titles in typewriter** (matches monologue-title font rule), one rounded glowing action chip per card ("Read this" / "Rehearse this too") = the deep link.
- Pinned header: "14 actors in the building today" with a slowly breathing glow dot.
- Trending card breaks the rhythm once daily: full-width, warmer, louder on purpose.

**Motion (the product):**
- Load: staggered rise, ~60ms apart, like house lights coming up.
- Live arrival: soft brand-orange pulse at the feed top (ghost light flaring) → card slides in via framer-motion layout animation, rest settling gently.
- Timestamps live-tick ("just now" → "2m ago").
- GPU-only: transform + opacity, never layout-thrashing properties. Render cap ~50 cards. First paint from React Query cache + skeleton — page appears instantly.

**Perf is a hard requirement (Canberk):** no request-time aggregation, fire-and-forget writes (core flows can't slow by 1ms), push not poll, precomputed trending, tiny payloads.

## Build order (each step shippable alone)

1. **Migration** — `community_events` + `share_activity`. ⚠️ Deploy-ordering rule: apply to Supabase BEFORE pushing backend code to main (Render auto-deploys).
2. Backend: `record_event` + call sites + `GET /api/community/feed` (+ tests).
3. `/community` page: full motion design + Realtime + opt-out toggle in profile settings.
4. Home ticker + landing teaser + trending daily job.
5. Phase 2 (separate design): async partner rehearsal — share scene link, partner records their lines once, rehearse against their real voice. Feed line: "Maya & Jordan rehearsed a scene together."
6. Phase 3 (separate design): live 1v1 synced sessions.

## Open questions

- Final name: "Green Room" vs "The Callboard" vs plain "Community".
- Whether `viewed` events fire too often for heavy browsers (may need per-user rate limit, e.g. max 1 view event per 10 min).
- Landing teaser: live data vs a curated static snapshot (live is more honest, needs a public unauthenticated endpoint with the same privacy guarantees).
