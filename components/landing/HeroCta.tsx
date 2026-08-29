"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalContext";

export function HeroCta() {
  const { user } = useAuth();
  const authModal = useAuthModal();
  const router = useRouter();
  const wrapRef = useRef<HTMLSpanElement>(null);

  const handleClick = () => {
    if (user) {
      router.push("/practice");
    } else {
      authModal?.openAuthModal("signup");
    }
  };

  // Gentle magnetic pull toward the cursor — a few px, never more.
  const handleMove = (e: React.MouseEvent<HTMLSpanElement>) => {
    const el = wrapRef.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width - 0.5) * 10;
    const dy = ((e.clientY - r.top) / r.height - 0.5) * 8;
    el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  };
  const handleLeave = () => {
    const el = wrapRef.current;
    if (el) el.style.transform = "translate(0, 0)";
  };

  return (
    <span
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="inline-block p-2 -m-2 transition-transform duration-300 ease-out"
    >
      <Button
        size="lg"
        className="h-12 sm:h-14 md:h-16 px-8 sm:px-12 md:px-14 text-sm sm:text-base md:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl hover:shadow-primary/25 transition-all"
        onClick={handleClick}
      >
        Start rehearsing
      </Button>
    </span>
  );
}
