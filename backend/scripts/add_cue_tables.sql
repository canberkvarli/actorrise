-- Cue, the in-app assistant (app/models/cue.py). NOT yet applied to prod.
-- Additive only: two new tables, nothing existing is touched.
-- Run before the deploy that ships Cue (see deploy-ordering memory).
-- RLS on with no policies, like every other table since the 2026-08-23
-- lockdown: the API reaches them through the service connection only.

CREATE TABLE IF NOT EXISTS cue_conversations (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    handoff_at     TIMESTAMPTZ,
    handoff_reason VARCHAR(32),
    read_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_cue_conversations_user_id    ON cue_conversations (user_id);
CREATE INDEX IF NOT EXISTS ix_cue_conversations_last_at    ON cue_conversations (last_at);
CREATE INDEX IF NOT EXISTS ix_cue_conversations_handoff_at ON cue_conversations (handoff_at);

CREATE TABLE IF NOT EXISTS cue_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES cue_conversations(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL,
    role            VARCHAR(16) NOT NULL,
    content         TEXT NOT NULL,
    tools           JSONB,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cue_messages_conversation_id ON cue_messages (conversation_id);
CREATE INDEX IF NOT EXISTS ix_cue_messages_user_id         ON cue_messages (user_id);
CREATE INDEX IF NOT EXISTS ix_cue_messages_created_at      ON cue_messages (created_at);

ALTER TABLE cue_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cue_messages      ENABLE ROW LEVEL SECURITY;
