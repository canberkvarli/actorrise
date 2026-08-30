-- Tags on community-shared scripts. Owner authors them, community upvotes.
-- Run against prod BEFORE deploying the backend, or /scripts endpoints 500.
-- See memory: deploy-ordering-schema-migrations.

CREATE TABLE IF NOT EXISTS script_tags (
    id              SERIAL PRIMARY KEY,
    user_script_id  INTEGER NOT NULL REFERENCES user_scripts(id) ON DELETE CASCADE,
    tag             VARCHAR(32) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_script_tag UNIQUE (user_script_id, tag)
);

CREATE INDEX IF NOT EXISTS ix_script_tags_user_script_id ON script_tags (user_script_id);
CREATE INDEX IF NOT EXISTS ix_script_tags_tag            ON script_tags (tag);

CREATE TABLE IF NOT EXISTS script_tag_votes (
    id             SERIAL PRIMARY KEY,
    script_tag_id  INTEGER NOT NULL REFERENCES script_tags(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_script_tag_vote UNIQUE (script_tag_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_script_tag_votes_script_tag_id ON script_tag_votes (script_tag_id);
CREATE INDEX IF NOT EXISTS ix_script_tag_votes_user_id       ON script_tag_votes (user_id);

-- RLS is on for every table in this DB (see memory: rls-lockdown-2026-08-23).
-- The app connects as service_role/superuser and bypasses RLS; enabling it here
-- keeps anon from reading these tables directly, matching every other table.
ALTER TABLE script_tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_tag_votes ENABLE ROW LEVEL SECURITY;
