# Admin unseen badges

2026-09-18

## The problem

Content requests have no way in. Fifteen titles actors asked for are sitting in
`content_requests`, some five months old, and the founder has never seen them.
They live in a tab inside `/admin/searches` driven by local `useState`, so there
is no nav entry, no badge, and no URL that points at them. The only way to find
one is to remember it exists.

The badge pattern already works: Feedback and Review both carry a counter in
`app/(platform)/admin/layout.tsx`, and a queue with a counter gets opened. Three
surfaces need one and do not have one.

## Scope

Badges for **Requests**, **Search** (failed and weak searches) and **Overview**
(trial conversions). Users deliberately gets none: a signup count is not work,
and a badge that means nothing trains you to ignore the ones that do.

Feedback and Review keep their existing per-row `read_at` logic untouched.

## Storage

New table, one row per admin per surface:

```sql
CREATE TABLE admin_seen (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  surface  VARCHAR(24) NOT NULL,
  seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, surface)
);
```

`surface` is one of `requests`, `searches`, `revenue`. A new surface is a new
string, not a new column or a new table. Nothing accumulates, so nothing needs
cleaning up.

Migration ships as `backend/scripts/add_admin_seen_table.sql`, matching the
existing convention (`add_user_events_table.sql`, `add_user_account_type.sql`).
Model goes in `backend/app/models/admin_seen.py`.

## Backend

### `GET /api/admin/pulse`

One endpoint returning every badge count:

```json
{ "feedback": 13, "review": 0, "requests": 4, "searches": 61, "revenue": 1 }
```

The layout polls two endpoints today; three more surfaces would mean five polls
a minute. One call instead. `feedback` and `review` reuse the queries already in
`admin/feedback.py` and `admin/monologues.py` rather than being rewritten.

Each unseen count is bounded by that surface's `seen_at`:

- **requests** — `content_requests` where `last_requested_at > seen_at`. Last,
  not first: a title asked for a second time should resurface rather than stay
  quiet because it was already counted once.
- **searches** — `search_logs` where `created_at > seen_at` and
  `results_count = 0 OR weak_match IS TRUE`. This is the exact predicate
  `_compute_summary` and `/searches/by-user` already use. It is not restated in
  a new place; it is imported or shared so the two cannot drift.
- **revenue** — `user_events` where `created_at > seen_at` and
  `event_name = 'trial_converted'`.

### `POST /api/admin/seen/{surface}`

Upserts `(user_id, surface, now())`. Rejects any surface outside the three with
a 422, the same way `VALID_STATUSES` is enforced in `admin/searches.py`.

Both endpoints sit behind `require_moderator`.

## Frontend

`app/(platform)/admin/layout.tsx`:

- `NavItem.badgeKey` widens from `"feedback" | "review"` to
  `"feedback" | "review" | "requests" | "searches" | "revenue"`. The rendering
  code does not change.
- The two `useQuery` calls collapse into one against `/api/admin/pulse`, same
  60s `refetchInterval` and 30s `staleTime`.
- New nav item **Requests** under Library, `IconInbox`,
  `href: "/admin/requests"`, `badgeKey: "requests"`.
- `badgeKey: "searches"` on Search, `badgeKey: "revenue"` on Overview.

Each of the three pages fires `POST /api/admin/seen/<surface>` once on mount and
invalidates the `admin-pulse` query key, so the badge clears while you are
looking at it. Overview owns `revenue`.

## Requests gets its own route

`ContentRequestsTab` moves out of `/admin/searches` into its own page at
`app/(platform)/admin/requests/page.tsx`, and the `requests` entry leaves the
`TABS` array on the searches page.

A `?tab=requests` deep link was the alternative, and it does not work: `isActive`
matches on `pathname.startsWith(href)`, so a Requests nav item pointing inside
`/admin/searches` would light Search up at the same time. A separate route
avoids that, and it is the honest grouping anyway. Requests is a work queue like
Review, not a view of search behaviour. The searches page keeps its four
analysis tabs and stays `useState`; nothing else changes there.

## Edge cases

- **No `admin_seen` row.** Never visited. Count from the admin's
  `users.created_at`, not from epoch, so a first load reads a handful rather
  than 1,265.
- **Pulse request fails.** Badges render as zero. No error state in the nav, no
  crash. Same as the current behaviour when either existing poll fails.
- **Clock.** All comparisons in UTC against `now()` server-side. The client
  never sends a timestamp.

## Testing

Backend (`backend/tests/`):

- seen stamp round-trips: post, then pulse reports zero for that surface
- no-row case counts from `users.created_at`, not from the beginning of time
- each of the three counts against seeded rows, including the both-zero-and-weak
  search row that must be counted once
- invalid surface returns 422
- non-moderator gets 403 from both endpoints

Frontend:

- a nav item with a `badgeKey` renders its count, and renders nothing at zero
- visiting a badged page clears its badge
- `/admin/requests` renders the requests queue, and only the Requests nav item
  reads as active there

## Not in this change

No email digest, no notification inbox with history, no push. If badges turn out
not to be enough, a digest reads from the same three counts and the same
`admin_seen` table.
