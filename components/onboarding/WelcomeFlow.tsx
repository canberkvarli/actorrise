"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { theatreFontVars } from "@/lib/fonts/theatre";

/* Three beats, in Canberk's voice rather than a product's.
 *
 * The old copy said "we", "our recommendations", "Powered by AI", and spelled
 * the name "Actorrise". There is no we — and a stranger does not need to be
 * told the search is powered by anything, only what to type into it.
 *
 * Reachability, so this is not mistaken for the first-run flow: onboarding's
 * persist() and its skip both set has_seen_welcome, so a new signup never gets
 * here. This is for the accounts that finished the old onboarding before that
 * flag existed. Worth keeping short for exactly that reason. */
const SLIDES = [
  {
    direction: "(house to half.)",
    headline: "The stage is yours.",
    body: "ActorRise is where you find the piece, cut it, and get it on its feet. I built it because I needed it.",
  },
  {
    direction: "(and who's out there.)",
    headline: "Tell me how you're cast.",
    body: "Your playing age, your type, what you want to work on. Three taps and every search leans your way.",
  },
  {
    direction: "(places.)",
    headline: "Then just ask for it.",
    body: "\"A dramatic monologue for a woman in her 30s, Chekhov.\" Say it the way you'd say it to a friend.",
  },
];

const ENTER = [0.22, 1, 0.36, 1] as [number, number, number, number];
const SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];

async function markWelcomeSeen() {
  try {
    await api.patch("/api/auth/onboarding", { has_seen_welcome: true });
  } catch {
    // Non-blocking: an onboarding flag update failure must not block the user
  }
}

export function WelcomeFlow({ onDismiss }: { onDismiss: () => void }) {
  const [slide, setSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const router = useRouter();

  const dismiss = useCallback(() => {
    onDismiss();
    markWelcomeSeen().catch(() => {}); // fire-and-forget — don't block the close
  }, [onDismiss]);

  const next = useCallback(() => {
    if (slide < SLIDES.length - 1) {
      setDirection(1);
      setSlide((s) => s + 1);
    }
  }, [slide]);

  const goToProfile = useCallback(() => {
    onDismiss();
    markWelcomeSeen().catch(() => {}); // fire-and-forget
    router.push("/profile");
  }, [onDismiss, router]);

  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  // Lock body scroll and kill pull-to-refresh / swipe-back while this is open.
  useEffect(() => {
    const prev = {
      overflow: document.body.style.overflow,
      touchAction: document.body.style.touchAction,
      overscroll: document.body.style.overscrollBehavior,
    };
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.touchAction = prev.touchAction;
      document.body.style.overscrollBehavior = prev.overscroll;
    };
  }, []);

  const preventTouchMove = useCallback((e: React.TouchEvent) => e.preventDefault(), []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`theatre-tokens theatre-onboarding ${theatreFontVars} fixed inset-0 z-[10000] flex touch-none items-center justify-center overflow-hidden p-6`}
      style={{ touchAction: "none", background: "var(--page)" }}
      onTouchMove={preventTouchMove}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to ActorRise"
    >
      {/* The same ghost light the onboarding card hangs under, so the two read
          as one room rather than two products. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--t-orange-glow) 28%, transparent), transparent 70%)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 z-0 flex flex-col items-center">
        <span
          className="block w-0.5"
          style={{
            height: "clamp(40px, 8vh, 90px)",
            background: "linear-gradient(to bottom, oklch(0.40 0.02 55), oklch(0.28 0.02 55))",
          }}
        />
        <span className="block h-3 w-[18px] rounded-b-[2px] rounded-t-[4px]" style={{ background: "oklch(0.30 0.02 55)" }} />
        <span
          className="block h-[42px] w-9 animate-ghost-flicker"
          style={{
            borderRadius: "50% 50% 46% 46%",
            background: "radial-gradient(circle at 50% 40%, oklch(0.99 0.05 95), var(--t-gel) 35%, oklch(0.75 0.17 60))",
            boxShadow:
              "0 0 28px 6px color-mix(in oklab, var(--t-gel) 70%, transparent), 0 0 120px 50px color-mix(in oklab, var(--t-orange-glow) 28%, transparent)",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97, rotate: -0.5 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: -0.6 }}
        transition={{ duration: 0.5, ease: ENTER }}
        className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-lg border-[1.5px]"
        style={{
          background: "var(--card)",
          color: "var(--t-text)",
          borderColor: "var(--t-text)",
          boxShadow: "14px 14px 0 var(--t-gel), 0 40px 120px -30px rgb(0 0 0 / 0.8)",
        }}
      >
        <div className="relative flex items-center justify-between gap-3 px-5 pt-4">
          <div className="flex items-center gap-[5px]" aria-hidden>
            {SLIDES.map((s, i) => (
              <span
                key={s.headline}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i === slide ? 24 : 8,
                  background:
                    i < slide
                      ? "var(--acc)"
                      : i === slide
                        ? "var(--t-text)"
                        : "color-mix(in oklab, var(--t-text) 20%, transparent)",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip the welcome"
            className="cursor-pointer border-0 bg-transparent py-1.5 text-xs italic tracking-[0.06em] underline underline-offset-4 transition-colors"
            style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-faint)")}
          >
            skip
          </button>
        </div>

        <div className="px-7 pb-7 pt-[22px]">
          <div className="min-h-[190px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={current.headline}
                custom={direction}
                initial={{ opacity: 0, x: direction * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -28 }}
                transition={{ type: "tween", duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <p
                  className="m-0 text-[13px] italic tracking-[0.08em]"
                  style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
                >
                  {current.direction}
                </p>
                <h2
                  className="mt-2 text-balance font-normal leading-none tracking-[-0.02em]"
                  style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.9rem, 4.5vw, 2.6rem)" }}
                >
                  {current.headline}
                </h2>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--t-muted-dark)" }}>
                  {current.body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {isLast ? (
            <div className="flex flex-col gap-2.5">
              <Pill onClick={goToProfile}>Set up my profile</Pill>
              <button
                type="button"
                onClick={dismiss}
                className="h-11 w-full rounded-full text-sm italic tracking-[0.06em] underline underline-offset-4 transition-colors"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-faint)")}
              >
                i&apos;ll explore on my own
              </button>
            </div>
          ) : (
            <Pill onClick={next}>Continue</Pill>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Pill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.02, rotate: -0.8 }}
      transition={{ duration: 0.3, ease: SPRING }}
      className="flex h-[52px] w-full items-center justify-between gap-3 rounded-full pl-[22px] pr-1.5 text-base font-bold"
      style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
    >
      {children}
      <span
        className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </motion.button>
  );
}
