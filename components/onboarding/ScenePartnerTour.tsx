"use client";

import { TourSpotlight, type TourStep } from "@/components/onboarding/TourSpotlight";

/* ScenePartner was the one room with no light on it.
 *
 * Search, Profile and Collection each got a followspot; the rehearsal room got
 * HowItWorksWalkthrough — a four-act playbill that explains the product in the
 * abstract, auto-opens only for someone with nothing on the shelf, and points
 * at no part of the screen it is covering. So the actor who arrived with a
 * script already uploaded (which is everyone after their first visit) was
 * shown the room and left to work it out.
 *
 * Three steps, matching the three things the room actually is: the line you
 * stopped on, the way to add to it, and the shelf it all lives on. No step for
 * "how this room works" — the playbill is still there behind that link, and a
 * tour whose last beat is "there is another tour" is not a tour.
 */
const STEPS: TourStep[] = [
  {
    targetId: "scenepartner-stage",
    title: "It opens where you stopped.",
    body: "The stage holds the last thing you were working on, and the way straight back into it. No list to hunt through.",
    placement: "bottom",
  },
  {
    targetId: "scenepartner-bring-in",
    title: "Bring your own sides.",
    body: "Drop in a PDF or paste the text. The scenes and characters pull themselves out, and I'll read every role that isn't yours.",
    placement: "bottom",
  },
  {
    targetId: "scenepartner-shelf",
    title: "Everything you've brought in.",
    body: "Tap a spine to open it and cut it into scenes. Drag the threads to put them in the order you're working.",
    placement: "top",
  },
];

export function ScenePartnerTour({ onDismiss }: { onDismiss: () => void }) {
  return (
    <TourSpotlight steps={STEPS} flag="has_seen_scenepartner_tour" onDismiss={onDismiss} />
  );
}
