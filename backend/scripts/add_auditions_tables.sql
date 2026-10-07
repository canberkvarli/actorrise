-- Audition tracker (backend/app/models/audition.py). Additive.
-- Apply on Supabase BEFORE the backend deploy that uses it.

CREATE TABLE IF NOT EXISTS auditions (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project        VARCHAR(200) NOT NULL,
    role           VARCHAR(200),
    kind           VARCHAR(16) NOT NULL DEFAULT 'in_person',
    status         VARCHAR(16) NOT NULL DEFAULT 'scheduled',
    starts_at      TIMESTAMPTZ,
    due_at         TIMESTAMPTZ,
    tz             VARCHAR(64) NOT NULL DEFAULT 'UTC',
    location       VARCHAR(300),
    casting        VARCHAR(200),
    casting_key    VARCHAR(200),
    material_raw   VARCHAR(300),
    material       JSONB,
    bring          VARCHAR(300),
    notes          TEXT,
    tape_link      VARCHAR(500),
    source         VARCHAR(16) NOT NULL DEFAULT 'manual',
    user_script_id INTEGER REFERENCES user_scripts(id) ON DELETE SET NULL,
    reminders_on   BOOLEAN NOT NULL DEFAULT TRUE,
    outcome_token  VARCHAR(48) NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_auditions_user_id ON auditions (user_id);
CREATE INDEX IF NOT EXISTS ix_auditions_casting_key ON auditions (casting_key);
CREATE INDEX IF NOT EXISTS ix_auditions_when ON auditions ((coalesce(starts_at, due_at))) WHERE deleted_at IS NULL;
ALTER TABLE auditions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audition_pieces (
    id           SERIAL PRIMARY KEY,
    audition_id  INTEGER NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
    monologue_id INTEGER,
    scene_id     INTEGER,
    used         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audition_pieces_audition_id ON audition_pieces (audition_id);
ALTER TABLE audition_pieces ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audition_events (
    id          SERIAL PRIMARY KEY,
    audition_id INTEGER NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        VARCHAR(24) NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audition_events_audition_id ON audition_events (audition_id);
CREATE INDEX IF NOT EXISTS ix_audition_events_user_id ON audition_events (user_id);
ALTER TABLE audition_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audition_reminder_sends (
    id          SERIAL PRIMARY KEY,
    audition_id INTEGER NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moment      VARCHAR(8) NOT NULL,
    local_day   VARCHAR(10) NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_audition_reminder_moment UNIQUE (audition_id, moment)
);
CREATE INDEX IF NOT EXISTS ix_audition_reminder_sends_user_day ON audition_reminder_sends (user_id, local_day);
ALTER TABLE audition_reminder_sends ENABLE ROW LEVEL SECURITY;

ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_feed_key VARCHAR(48) UNIQUE;

-- Reading it back:
--   select status, count(*) from auditions where deleted_at is null group by 1;
--   select moment, count(*) from audition_reminder_sends group by 1;
