# First-Search Feedback Email — Design

## Goal

When a signed-up user makes their **first** search on ActorRise, surface them in an admin queue so Canberk can send a personal feedback email with one click. Replies land in canberk@actorrise.com; founder codes (12 months Plus free) are sent manually in the reply.

## Non-goals (out of scope for v1)

- Anonymous-searcher emails (no email on file)
- Automated cron sending (queue is live-filtered, no scheduled job)
- Founder code generation system (manual Stripe promo code per reply)
- Retroactive emailing of users who searched before this ships

## Architecture

```
User makes first search ─┐
                         ▼
              search_logs row inserted (user_id set)
                         │
                         │   (no extra write — live query)
                         ▼
   /admin/feedback-queue ◄─── GET /api/admin/feedback-queue
                         │     queries: users where ≥1 search AND
                         │     feedback_email_status IS NULL
                         │
                         ▼
              Canberk clicks "Send" per row
                         │
                         ▼
         POST /api/admin/feedback-queue/{user_id}/send
              ├─ Render feedback_request.html (Jinja, base_personal)
              ├─ Send via existing email service (reply-to = canberk@actorrise.com)
              ├─ UPDATE users SET feedback_email_status='sent', feedback_email_sent_at=now()
              └─ Return success
```

## Data model

**Migration:** add two columns to `users`:

| Column | Type | Notes |
|---|---|---|
| `feedback_email_status` | `VARCHAR(20)` nullable | `NULL` = eligible, `'sent'`, `'skipped'` |
| `feedback_email_sent_at` | `TIMESTAMP` nullable | Set when status flips to `'sent'` |

No new tables. Index on `feedback_email_status` (partial index `WHERE feedback_email_status IS NULL`) so the queue query stays fast as the table grows.

## Queue query

```sql
SELECT u.id, u.email, u.name, u.created_at,
       sl.query AS first_query, sl.created_at AS first_search_at,
       COUNT(sl2.id) AS total_searches
FROM users u
JOIN search_logs sl ON sl.user_id = u.id
LEFT JOIN search_logs sl2 ON sl2.user_id = u.id
WHERE u.feedback_email_status IS NULL
  AND sl.id = (SELECT MIN(id) FROM search_logs WHERE user_id = u.id)
GROUP BY u.id, sl.id
ORDER BY sl.created_at DESC
LIMIT 50;
```

(Final form lives in `backend/app/api/admin/feedback_queue.py`; SQLAlchemy not raw SQL.)

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/feedback-queue` | List eligible users (paginated, default 50) |
| POST | `/api/admin/feedback-queue/{user_id}/send` | Render + send email, mark `sent` |
| POST | `/api/admin/feedback-queue/{user_id}/skip` | Mark `skipped` (no email) |

All three behind existing admin auth middleware. No bulk endpoint in v1 — admin page can fire them client-side in a loop if needed.

## Email template

New file: `backend/app/services/email/templates/feedback_request.html`, extends `base_personal.html`.

Subject: `quick q about your first search`

Body (first-person, no dashes, sign-off "Canberk"):

```
hey {{ first_name }},

saw you just made your first search on actorrise — "{{ first_query }}".
curious: did you find what you were looking for? was anything missing?

i'm building this solo and every bit of feedback from a real actor
changes what i ship next.

just reply to this email if you've got a sec. if you'd be into being
part of the small founders group, i can hook you up with a code for
12 months of plus on me — just hit reply.

Canberk
Founder | Actor
actorrise.com
```

Reply-to header: `canberk@actorrise.com` (or whatever the existing personal-email sender uses — check `email/marketing.py`).

Template renderer: add `render_feedback_request(user, first_query)` to `EmailTemplates` class in `backend/app/services/email/templates.py`.

## Admin UI

New page: `app/(platform)/admin/feedback-queue/page.tsx`. Pattern matches `/admin/searches`.

Columns: name, email, signed-up date, first query, first-search timestamp, total searches, actions.

Per row: `[ Send email ]` and `[ Skip ]` buttons. After click, optimistically remove row from list; toast on success/failure.

Header: total-count chip + a `[ Send all visible ]` button (with confirm dialog).

## Edge cases

- **User unsubscribed** (if there's an unsub flag on users): respect it — exclude from queue and the send endpoint refuses with 400.
- **Duplicate sends**: send endpoint is idempotent via the `feedback_email_status` check — returns 409 if already sent or skipped.
- **First search is junk** (`asdf`, single char): admin sees it in the queue and clicks Skip. No automated filtering — preserves the human eye.

## Testing

- Unit: `EmailTemplates.render_feedback_request` returns a string containing first name + first query.
- Integration: send endpoint sets status + timestamp, second call returns 409, skip endpoint sets `'skipped'`.
- Manual: hit `/admin/feedback-queue` with a seeded test user, click send, check inbox.

## Rollout

1. Migration on staging, eyeball queue page, send one to canberk@ as a test.
2. Migration on prod. **No backfill skip.** All existing users with ≥1 search become immediately eligible (status NULL). The queue will show the full backlog on day one, and Canberk works through it at his own pace.
