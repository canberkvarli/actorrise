"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_STORE_URL } from "@/components/landing/v2/GhostLightAppTeaser";

/**
 * The app, said once, to someone who has stayed.
 *
 * `AppLaunchBar` is a thin line above the header and the teaser is section 11 of
 * 13. In the two days since launch, 173 people arrived and four clicks happened,
 * all four of them ours. A quieter placement was not the answer.
 *
 * DESIGN. A ghost light is the single bare bulb left burning on an empty stage
 * overnight so nobody walks into the dark. That is the product and so it is the
 * modal: an unlit stage, one bulb, and the app standing in the light it throws.
 * A white card with a blue button would be selling a different app.
 *
 * The `--stage-*` tokens are deliberately theme-independent, so this stays a
 * dark theatre whether or not the reader's browser is in light mode. That is the
 * point rather than an oversight: the ghost light only means anything in a dark
 * house.
 *
 * BEHAVIOUR. Three rules, because an app-download modal is otherwise the most
 * disliked pattern on the mobile web:
 *
 * 1. LANDING PAGE ONLY. Google penalises intrusive interstitials on mobile and
 *    app-download popups are the textbook case. This site lives on 1,281 SEO
 *    landing pages, mostly individual monologues, and putting this on those would
 *    risk the channel that feeds everything to win a secondary conversion. The
 *    monologue pages get Apple's Smart App Banner instead, which Google exempts.
 * 2. IT WAITS. Not on arrival. Either fifteen seconds or a third of the way down,
 *    whichever comes first, so it only interrupts someone who stayed.
 * 3. ONCE, EVER. Dismissing is remembered, and so is accepting.
 *
 * It never appears where it cannot convert: Android sees nothing, because the app
 * is iOS-only. Desktop gets a QR code rather than a dead button, because the
 * phone that would install it is in their pocket, not on their desk.
 */

const DISMISS_KEY = "ar_ghostlight_modal_v1";
const DELAY_MS = 15_000;
const SCROLL_FRACTION = 0.33;

type Platform = "ios" | "desktop" | "none";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "none";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "none";
  // iPadOS 13+ reports itself as a Mac and is only distinguishable by touch
  // points. Without this an iPad gets the desktop QR and is told to scan it with
  // the very device it is already holding.
  const isIpadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIpadOS) return "ios";
  return "desktop";
}

/** Fire-and-forget; the page must not care whether analytics exists. */
function track(event: string) {
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", event, {
      app_id: "6804278673",
    });
  } catch {
    /* never let a missing tag break the page */
  }
}

/**
 * The ghost light itself: flex, glass, filament.
 *
 * Drawn rather than shipped as an image so the filament can carry the same warm
 * accent as everything else and glow without a second network request.
 */
function Bulb() {
  return (
    <svg
      viewBox="0 0 40 74"
      aria-hidden
      className="relative h-[74px] w-10 overflow-visible"
    >
      <defs>
        <radialGradient id="gl-filament" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--stage-glow)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--stage-glow)" stopOpacity="0.25" />
        </radialGradient>
      </defs>

      {/* The flex, disappearing up into the fly tower rather than starting from
          nowhere: the line fades out at the top instead of ending in a stub. */}
      <line
        x1="20"
        y1="-40"
        x2="20"
        y2="34"
        stroke="var(--stage-line)"
        strokeWidth="1"
      />
      {/* Cage/socket */}
      <rect x="15" y="30" width="10" height="7" rx="1.6" fill="var(--stage-raised)" stroke="var(--stage-line)" strokeWidth="0.75" />
      {/* Glass */}
      <ellipse cx="20" cy="49" rx="10.5" ry="12.5" fill="var(--stage-glow)" fillOpacity="0.1" stroke="var(--stage-glow)" strokeOpacity="0.35" strokeWidth="0.75" />
      {/* Filament, the one genuinely hot thing in the composition */}
      <circle cx="20" cy="49" r="5" fill="url(#gl-filament)" />
      <path d="M17 51.5q3-6 6 0" stroke="var(--stage-glow)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function GhostLightModal() {
  const [platform, setPlatform] = useState<Platform>("none");
  const [open, setOpen] = useState(false);

  const remember = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Safari private mode throws. Not remembering is not a reason to block. */
    }
  }, []);

  useEffect(() => {
    const where = detectPlatform();
    if (where === "none") return;

    let seen = false;
    try {
      seen = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* unreadable storage: treat as unseen rather than never showing at all */
    }
    if (seen) return;

    setPlatform(where);

    // Whichever arrives first. Both are engagement signals: the timer catches
    // someone reading the hero, the scroll catches someone who went looking.
    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
      setOpen(true);
      track("ghostlight_modal_shown");
    };

    const onScroll = () => {
      const scrollable = document.body.scrollHeight - window.innerHeight;
      if (scrollable > 0 && window.scrollY / scrollable >= SCROLL_FRACTION) show();
    };

    const timer = setTimeout(show, DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Closing by any route — the X, Escape, the overlay — counts as an answer.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      remember();
      track("ghostlight_modal_dismissed");
    }
  };

  if (platform === "none") return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="stage-scene stage-grain max-w-[368px] gap-0 overflow-hidden rounded-[22px] border-[var(--stage-line)] p-0 text-[var(--stage-fg)] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.75)]"
      >
        {/* ── The stage ─────────────────────────────────────────────────────
            The bulb hangs, the light falls, the app stands in it. Fixed height
            so the composition cannot be pushed around by copy length. */}
        <div className="relative h-[212px] w-full overflow-hidden">
          {/* The throw of the light. Elliptical and anchored to the bulb, not a
              centred circle, so it reads as a source above rather than a glow
              behind. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 78% at 50% 22%, color-mix(in oklab, var(--stage-glow) 26%, transparent) 0%, transparent 62%)",
            }}
          />

          <div className="absolute left-1/2 top-0 -translate-x-1/2 motion-safe:animate-ghost-flicker">
            <Bulb />
          </div>

          {/* The app, standing in the light and cropped by the dark. Tilted a
              little so it is a thing on a stage rather than a screenshot pasted
              into a box. */}
          <div className="absolute left-1/2 top-[96px] w-[132px] -translate-x-1/2 rotate-[-4deg]">
            <div className="overflow-hidden rounded-[14px] border border-[var(--stage-line)] shadow-[0_18px_40px_-8px_rgba(0,0,0,0.85)]">
              <Image
                src="/ghostlight/read.png"
                alt="Ghost Light showing a monologue on a warm paper page"
                width={680}
                height={1471}
                className="h-auto w-full"
                priority={false}
              />
            </div>
          </div>

          {/* Dark rising from the floor, so the phone dissolves into the stage
              instead of being guillotined by the panel edge. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
            style={{
              background:
                "linear-gradient(to top, var(--stage) 12%, color-mix(in oklab, var(--stage) 70%, transparent) 55%, transparent 100%)",
            }}
          />
        </div>

        {/* ── The house ─────────────────────────────────────────────────────── */}
        <div className="relative px-6 pb-6 text-center">
          <p className="stage-direction text-[11px] text-[var(--stage-faint)]">
            (the light that never goes out.)
          </p>

          <DialogTitle className="font-brand mt-2 text-[27px] font-medium leading-[1.15] tracking-[-0.01em]">
            The stage,{" "}
            <em className="italic text-[var(--stage-glow)]">in your pocket</em>.
          </DialogTitle>

          <DialogDescription className="mx-auto mt-3 max-w-[19rem] text-[13px] leading-relaxed text-[var(--stage-muted)]">
            Eight thousand monologues. Search by character, tone or length, keep
            what you find, and read it offline in the waiting room.
          </DialogDescription>

          {platform === "ios" ? (
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                // Remembered on the way out too. Someone who took the offer must
                // never be asked again on their next visit.
                remember();
                track("ghostlight_modal_accepted");
                setOpen(false);
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-primary-solid px-5 py-3 text-[14px] font-semibold text-primary-solid-foreground shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--stage-glow)_60%,transparent)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg aria-hidden viewBox="0 0 384 512" className="h-4 w-4" fill="currentColor">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C61.8 141.2 12 184.5 12 272.5c0 26 4.8 52.8 14.3 80.4 12.7 36.3 58.6 125.4 106.5 123.9 25-.6 42.7-17.8 75.3-17.8 31.6 0 48 17.8 75.8 17.8 48.3-.7 89.8-81.7 101.9-118.1-64.8-30.5-64.1-89.4-64.1-91.1zm-59.2-162c28.6-33.9 26-64.8 25.2-75.9-25.3 1.5-54.6 17.3-71.3 36.7-18.4 20.8-29.2 46.5-26.9 75.3 27.4 2.1 52.4-12 73-36.1z" />
              </svg>
              Get it free
            </a>
          ) : (
            <div className="mt-5 flex items-center justify-center gap-4 rounded-2xl border border-[var(--stage-line)] bg-[var(--stage-raised)] p-3 text-left">
              {/* A desktop visitor cannot install an iPhone app, and a web App
                  Store page is a dead end. Point the phone in their pocket here
                  instead. White plate because a QR needs the contrast to scan. */}
              <Image
                src="/ghostlight/appstore-qr.png"
                alt="QR code linking to Ghost Light: Monologues on the App Store"
                width={480}
                height={480}
                className="h-[76px] w-[76px] shrink-0 rounded-lg bg-white p-1.5"
                unoptimized
              />
              <p className="text-[12px] leading-relaxed text-[var(--stage-muted)]">
                Point your phone&rsquo;s camera here.
                <span className="mt-0.5 block text-[var(--stage-faint)]">
                  iPhone and iPad. Free to start.
                </span>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GhostLightModal;
