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
      {/* No page title. The call sheet below opens with the actor's own name as
          the h1, and "(your dressing room.)" over "Your profile" over "your
          name" was three possessives stacked in four inches. */}
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



