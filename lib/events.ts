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
  | "onboarding_question_skipped"
  | "onboarding_ending_shown"
  | "onboarding_ending_answer"
  | "onboarding_ending_skip"
  | "onboarding_picks_kept"
  | "search_box_focused"
  | "cut_editor_opened"
  | "notes_field_focused"
  | "memorized_toggled"
  | "beat_saved"
  | "beat_cleared"
  | "monologue_work_finished"
  | "rehearsal_input_mode"
  | "rehearsal_voice_advanced"
  | "scene_line_delivered"
  | "guided_scene_shown"
  | "guided_scene_started"
  | "run_entry_shown"
  | "run_entry_tapped"
  | "run_start_screen_shown"
  | "guided_scene_finished"
  | "upgrade_modal_viewed"
  | "trial_offer_shown"
  | "trial_offer_dismissed"
  | "checkout_started"
  | "paywall_hit"
  | "paywall_dismissed"
  | "paywall_cta_clicked"
  | "email_clicked"
  | "scene_run_abandoned"
  | "audition_parse_corrected"
  | "audition_prep_started"
  | "audition_reminder_clicked"
  | "audition_landing_shown"
  | "audition_strip_clicked"
  | "calendar_feed_subscribed"
  | "class_link_self_made"
  | "class_link_copied"
  | "language_switched"
  | "studio_opened"
  | "studio_piece_chosen"
  | "studio_question_answered"
  | "studio_moment_pinned"
  | "studio_arc_played"
  | "studio_places_started"
  | "studio_places_finished"
  | "studio_prep_step"
  | "studio_prep_done"
  | "studio_run_it"
  | "studio_after_asked"
  | "studio_after_saved"
  | "studio_gesture_opened"
  | "studio_gesture_kept"
  | "studio_gesture_inward";

type Props = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(event_name: UserEventName, properties?: Props): void {
  if (typeof window === "undefined") return;
  api.post("/api/events", { event_name, properties: properties ?? {} }).catch(() => {});
}
