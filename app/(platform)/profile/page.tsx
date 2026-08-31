"use client";

import { useState, useEffect } from "react";
import { ActorProfileForm } from "@/components/profile/ActorProfileForm";
import { ProfilePrivacyCard } from "@/components/profile/ProfilePrivacyCard";
import { ProfileTour } from "@/components/onboarding/ProfileTour";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [showProfileTour, setShowProfileTour] = useState(false);

  useEffect(() => {
    if (user && user.has_seen_profile_tour === false) {
      const timer = setTimeout(() => setShowProfileTour(true), 600);
      return () => clearTimeout(timer);
    }
  }, [user]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* The call sheet below already states the actor's name and how complete
          the profile is, so a second "Actor Profile / better profile = better
          matches" heading above it was saying the same thing twice, worse. */}
      <div className="mb-8">
        <p className="stage-direction text-xs text-muted-foreground/70 mb-2">(your dressing room.)</p>
        <h1 className="font-brand text-3xl sm:text-4xl font-semibold">Your profile</h1>
      </div>
      <ActorProfileForm />
      <ProfilePrivacyCard />
      {showProfileTour && (
        <ProfileTour
          onDismiss={async () => {
            setShowProfileTour(false);
            await refreshUser();
          }}
        />
      )}
    </div>
  );
}



