"use client";

import { useState, useEffect } from "react";
import { ActorProfileForm } from "@/components/profile/ActorProfileForm";
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Actor Profile</h1>
        <p className="text-muted-foreground">
          Better profile = better matches and recommendations. Saved automatically.
        </p>
      </div>
      <ActorProfileForm />
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



