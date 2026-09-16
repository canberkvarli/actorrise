"use client";

import { TourSpotlight, type TourStep } from "@/components/onboarding/TourSpotlight";

/* The Collection had no tour at all, which mattered more once the onboarding
 * payoff started filling it: an actor finished five taps, kept four pieces, and
 * the next time they opened Collection they found a lit panel and a rail with
 * no account of which was which.
 *
 * Only two steps. The room only has two parts, and a tour that invents a third
 * to feel thorough is how the search tour ended up pointing at a filter bar
 * that had not existed for a month. */
const STEPS: TourStep[] = [
  {
    targetId: "collection-bench",
    title: "The one you're on.",
    body: "Whatever you opened last sits here, lit, with the way back into rehearsing it.",
    placement: "bottom",
  },
  {
    targetId: "collection-shelf",
    title: "Everything else you kept.",
    body: "Tap any spine to bring it to the bench. Saving more is a tap on any monologue in the library.",
    placement: "top",
  },
];

export function CollectionTour({ onDismiss }: { onDismiss: () => void }) {
  return (
    <TourSpotlight steps={STEPS} flag="has_seen_collection_tour" onDismiss={onDismiss} />
  );
}
