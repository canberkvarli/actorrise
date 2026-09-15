"use client";

import { TourSpotlight, type TourStep } from "@/components/onboarding/TourSpotlight";

/* Three anchors, because three is what /monologues has.
 *
 * This was five. One pointed at `search-filters`, which has not existed since
 * the search rebuild, so it dimmed the page and floated a card about filters
 * the reader could not see. Another explained where to find full screenplays
 * on IMSDb and Script Slug — true, but it belongs on a film/TV title, not in a
 * tour of the search box, and it was the last thing anyone read before they
 * started searching. */
const STEPS: TourStep[] = [
  {
    targetId: "search-input",
    title: "Ask for it in plain English.",
    body: "\"A Chekhov monologue for a woman in her 30s.\" Describe the audition the way you'd say it out loud.",
    placement: "bottom",
  },
  {
    targetId: "search-find-for-me",
    title: "Or let me choose.",
    body: "Find for me reads your profile and pulls pieces you haven't come across yet.",
    placement: "bottom",
  },
  {
    targetId: "search-results",
    title: "Best fit, first.",
    body: "Results are ranked on your type and what you asked for, and the overdone ones are pushed down.",
    placement: "top",
  },
];

export function SearchTour({ onDismiss }: { onDismiss: () => void }) {
  return <TourSpotlight steps={STEPS} flag="has_seen_search_tour" onDismiss={onDismiss} />;
}
