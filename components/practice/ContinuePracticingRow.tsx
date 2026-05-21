"use client";

/**
 * ContinuePracticingRow — placeholder component.
 *
 * Phase 2 ships without a recent-rehearsals data source. No backend endpoint or
 * client query exists yet for "scenes the user recently rehearsed", so this
 * component currently always returns null. Phase 3 should add a hook (e.g.
 * `useRecentRehearsals()`) backed by a new endpoint (e.g.
 * `GET /api/scenes/rehearse/recent`) that returns the most-recent N rehearsal
 * sessions with: { scene_id, scene_title, script_id, script_title, character_name, last_practiced_at }.
 *
 * Once that exists, render a horizontal-scroll row of 1–3 cards with:
 *   - scene title
 *   - script title  ·  "as [your character]"
 *   - Resume button → `/scenes/{scene_id}/rehearse?script={script_id}` (a fresh
 *     rehearse navigation; the rehearse page handles session creation).
 *
 * Visual rules: card hover is `shadow-md` (not `shadow-lg`). Plain-text
 * metadata with `·` separators. No decorative icons in the metadata row.
 */
export function ContinuePracticingRow() {
  return null;
}

export default ContinuePracticingRow;
