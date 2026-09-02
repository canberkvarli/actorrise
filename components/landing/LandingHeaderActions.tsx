"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalContext";

export function LandingHeaderActions() {
  const { user, loading } = useAuth();
  const authModal = useAuthModal();

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 transition-opacity duration-300 ${
        loading ? "opacity-0" : "opacity-100"
      }`}
    >
      {user ? (
        <>
          {/* One way back in on a phone, not two.
              At 390px this row is the logo, the menu button, the theme toggle,
              "Monologues" and the Practice pill — which came to 402px against a
              390px viewport, so the pill was sliced down its right edge. Both
              links go to the same app, and its own nav is one tap away once you
              are inside, so the text link waits for a wider screen. */}
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
            <Link href="/monologues">Monologues</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full px-3 sm:px-5 text-xs sm:text-sm whitespace-nowrap">
            <Link href="/practice">Practice</Link>
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => authModal?.openAuthModal("login")}
            className="hidden sm:inline-flex"
          >
            Sign in
          </Button>
          <Button
            size="sm"
            className="rounded-full px-3 sm:px-5 text-xs sm:text-sm whitespace-nowrap"
            onClick={() => authModal?.openAuthModal("signup")}
          >
            <span className="hidden sm:inline">Get started</span>
            <span className="sm:hidden">Get started</span>
          </Button>
        </>
      )}
    </div>
  );
}
