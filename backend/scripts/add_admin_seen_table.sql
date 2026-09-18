-- admin_seen: when each admin last opened a badged surface.
--
-- Run against prod BEFORE the deploy that ships /api/admin/pulse, or the
-- endpoint 500s on a missing relation. Idempotent, safe to re-run.

CREATE TABLE IF NOT EXISTS admin_seen (
    user_id  INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    surface  VARCHAR(24) NOT NULL,
    seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, surface)
);
