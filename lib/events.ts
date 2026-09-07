/**
 * Product events -> user_events (backend/app/services/events.py).
 *
 * Not GA4. lib/analytics.ts feeds GA4, which ad blockers eat and which cannot
 * be joined to a users row. This lands in Postgres next to search_logs so the
 * funnel is one SQL query. Fire-and-forget: never awaited, never throws.
 *
 * The names are a closed list on the server; an unknown name is silently
 * dropped, so add it there first.
 */

import api from "./api";

export type UserEventName =
  | "onboarding_step_viewed"
  | "search_box_focused"
  | "cut_editor_opened"
  | "notes_field_focused"
  | "memorized_toggled"
  | "beat_saved"
  | "beat_cleared"
  | "monologue_work_finished";

type Props = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(event_name: UserEventName, properties?: Props): void {
  if (typeof window === "undefined") return;
  api.post("/api/events", { event_name, properties: properties ?? {} }).catch(() => {});
}
