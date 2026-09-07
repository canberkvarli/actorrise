-- Day-3 / day-10 lifecycle email claims (backend/app/models/lifecycle_email.py).
-- Additive. create_all also makes this on boot, but Render deploys before boot
-- finishes, so apply it on Supabase in the same step as the commit.

CREATE TABLE IF NOT EXISTS lifecycle_email_sends (
    id       SERIAL PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    touch    VARCHAR(16) NOT NULL,
    anchor   VARCHAR(16),
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lifecycle_email_user_touch UNIQUE (user_id, touch)
);
CREATE INDEX IF NOT EXISTS ix_lifecycle_email_sends_user_id ON lifecycle_email_sends (user_id);
ALTER TABLE lifecycle_email_sends ENABLE ROW LEVEL SECURITY;

-- Reading it back:
--   select touch, anchor, count(*) from lifecycle_email_sends
--   where sent_at >= now() - interval '7 days' group by 1,2 order by 1,2;
--
-- Did the touch bring anyone back? (activity within 3 days of the send)
--   select l.touch, count(*) sent,
--          count(*) filter (where exists (
--            select 1 from search_logs s where s.user_id=l.user_id
--              and s.created_at between l.sent_at and l.sent_at + interval '3 days')) returned
--   from lifecycle_email_sends l group by 1;
