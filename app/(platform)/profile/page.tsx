"use client";

import { ActorProfileForm } from "@/components/profile/ActorProfileForm";
import { ProfilePrivacyCard } from "@/components/profile/ProfilePrivacyCard";
import { ProfileTour } from "@/components/onboarding/ProfileTour";
import { useTourTrigger } from "@/components/onboarding/useTourTrigger";

export default function ProfilePage() {
  /* Was its own effect keyed on `user`, which re-fired after the dismissal's
     refreshUser() if the flag write had not landed yet and ran the tour a
     second time. It also never waited for onboarding to finish, so it could
     stack on the first-run card. */
  const { show: showProfileTour, dismiss: dismissProfileTour } =
    useTourTrigger("has_seen_profile_tour", { delay: 600 });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* No page title. The call sheet below opens with the actor's own name as
          the h1, and "(your dressing room.)" over "Your profile" over "your
          name" was three possessives stacked in four inches. */}
      <ActorProfileForm />
      <ProfilePrivacyCard />
      {showProfileTour && <ProfileTour onDismiss={dismissProfileTour} />}
    </div>
  );
}



