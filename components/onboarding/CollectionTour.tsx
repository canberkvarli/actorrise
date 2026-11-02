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
    title: "appShellTours.collectionBenchTitle",
    body: "appShellTours.collectionBenchBody",
    placement: "bottom",
  },
  {
    targetId: "collection-shelf",
    title: "appShellTours.collectionShelfTitle",
    body: "appShellTours.collectionShelfBody",
    placement: "top",
  },
];

export function CollectionTour({ onDismiss }: { onDismiss: () => void }) {
  return (
    <TourSpotlight steps={STEPS} flag="has_seen_collection_tour" onDismiss={onDismiss} />
  );
}
