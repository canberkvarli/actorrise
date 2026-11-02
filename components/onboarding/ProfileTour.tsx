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
    title: "appShellTours.profileProgressTitle",
    body: "appShellTours.profileProgressBody",
    placement: "bottom",
  },
  {
    targetId: "profile-headshot",
    title: "appShellTours.profileHeadshotTitle",
    body: "appShellTours.profileHeadshotBody",
    placement: "bottom",
  },
  {
    targetId: "profile-tabs",
    title: "appShellTours.profileTabsTitle",
    body: "appShellTours.profileTabsBody",
    placement: "bottom",
  },
  {
    targetId: "profile-preferences",
    title: "appShellTours.profilePrefsTitle",
    body: "appShellTours.profilePrefsBody",
    placement: "top",
  },
];

export function ProfileTour({ onDismiss }: { onDismiss: () => void }) {
  return <TourSpotlight steps={STEPS} flag="has_seen_profile_tour" onDismiss={onDismiss} />;
}
