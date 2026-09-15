"use client";

import { TourSpotlight, type TourStep } from "@/components/onboarding/TourSpotlight";

/* The tab names changed when the rail stopped naming the database ("Basic Info
 * / Acting Info / Preferences") and started naming what the actor is doing in
 * each one. The tour still read the old names out loud. It also had a step for
 * every educator, who is shown no rail at all — TourSpotlight drops those now
 * rather than lighting nothing. */
const STEPS: TourStep[] = [
  {
    targetId: "profile-progress",
    title: "Your casting line.",
    body: "How you read on paper. Tap any blank in it and you land on the field that fills it.",
    placement: "bottom",
  },
  {
    targetId: "profile-headshot",
    title: "The headshot.",
    body: "JPG or PNG, up to 5MB. It's the first thing anyone looks at, here too.",
    placement: "bottom",
  },
  {
    targetId: "profile-tabs",
    title: "Who you are, how you work.",
    body: "Age range, location, training, what you're usually cast as. This is what search leans on.",
    placement: "bottom",
  },
  {
    targetId: "profile-preferences",
    title: "What you see.",
    body: "Tune what search and recommendations put in front of you. Everything saves as you go.",
    placement: "top",
  },
];

export function ProfileTour({ onDismiss }: { onDismiss: () => void }) {
  return <TourSpotlight steps={STEPS} flag="has_seen_profile_tour" onDismiss={onDismiss} />;
}
