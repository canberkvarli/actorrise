"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalContext";

type Size = "hero" | "mid" | "nav";

/**
 * "Start rehearsing" — the one call to action on the page, at three sizes.
 *
 * Same destination logic as the old `HeroCta`: a signed-in actor goes straight
 * to /practice, everyone else gets the signup modal. It is a <button> and not
 * an <a> because neither branch is a navigation to a URL you could usefully
 * open in a new tab.
 */
export function TheatreCta({
  size = "hero",
  className = "",
}: {
  size?: Size;
  className?: string;
}) {
  const { user } = useAuth();
  const authModal = useAuthModal();
  const router = useRouter();

  const handleClick = () => {
    if (user) {
      router.push("/practice");
    } else {
      authModal?.openAuthModal("signup");
    }
  };

  const sizeClass = size === "mid" ? "t-cta--mid" : size === "nav" ? "t-cta--nav" : "";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`t-cta ${sizeClass} ${className}`.trim()}
    >
      Start rehearsing
      {size !== "nav" && (
        <span className="t-cta__dot" aria-hidden>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      )}
    </button>
  );
}
