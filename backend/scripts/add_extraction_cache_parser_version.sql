-- The extraction cache is keyed on file content alone, so it had no idea which
-- version of the parser produced a row. When the parser was fixed on 2026-09-02
-- (angled watermarks, fake bold, revision marks, titles), every cached script
-- kept serving the old, broken result and the deploy looked like it had done
-- nothing. Rows made before this column existed default to 1, which is below
-- the current PARSER_VERSION, so they all retire themselves on first read.

ALTER TABLE extraction_cache
  ADD COLUMN IF NOT EXISTS parser_version INTEGER NOT NULL DEFAULT 1;
