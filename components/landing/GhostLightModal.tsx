"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { GhostLight } from "@/components/brand/GhostLight";
import { APP_STORE_URL } from "@/components/landing/v2/GhostLightAppTeaser";
import { API_URL } from "@/lib/api";

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

const STATS_CACHE_KEY = "actorrise_public_stats_v1";

/**
 * How big the library actually is, from the same source the rest of the landing
 * page uses.
 *
 * It was written here as "eight thousand", which was wrong by more than five
 * thousand pieces: the real figure is north of thirteen. Every hardcoded count
 * is a number that was true once, and the library grows every week, so the modal
 * asks rather than remembers.
 *
 * Reads `LandingLiveCount`'s cache first, which is already warm because that
 * component runs on this same page, so the number is there on first paint. The
 * network call then refreshes it. Null until one of them answers, and the copy
 * is written to read properly either way rather than flashing a zero.
 */
function useLibrarySize(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STATS_CACHE_KEY);
      const cached = raw ? (JSON.parse(raw) as { total_monologues?: number }) : null;
      if (typeof cached?.total_monologues === "number" && cached.total_monologues > 0) {
        setCount(cached.total_monologues);
      }
    } catch {
      /* unreadable cache just means we wait for the network */
    }

    let alive = true;
    fetch(`${API_URL}/api/public/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { total_monologues?: number } | null) => {
        if (alive && typeof d?.total_monologues === "number" && d.total_monologues > 0) {
          setCount(d.total_monologues);
        }
      })
      .catch(() => {
        /* a modal must never depend on a stats endpoint being up */
      });
    return () => {
      alive = false;
    };
  }, []);

  return count;
}

export function GhostLightModal() {
  const [platform, setPlatform] = useState<Platform>("none");
  const [open, setOpen] = useState(false);
  const library = useLibrarySize();

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
      {/* The close button belongs to the Dialog primitive and is styled for a
          light card: an accent-filled plate and a focus ring that draws a box
          around itself the moment the modal opens. On a dark stage that reads as
          a rendering fault. Neutralised here rather than in ui/dialog.tsx, which
          every other modal in the app depends on. */}
      <DialogContent
        className="stage-scene stage-grain max-w-[368px] gap-0 overflow-hidden rounded-[22px] border-[var(--stage-line)] p-0 text-[var(--stage-fg)] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.75)] [&>button]:right-0 [&>button]:top-0 [&>button]:rounded-full [&>button]:text-[var(--stage-fg)] [&>button]:opacity-40 [&>button]:outline-none [&>button]:ring-0 [&>button]:ring-offset-0 [&>button]:transition-opacity [&>button]:hover:opacity-100 [&>button]:focus:outline-none [&>button]:focus:ring-0 [&>button]:focus-visible:outline-none [&>button]:focus-visible:ring-0 [&>button]:data-[state=open]:bg-transparent"
      >
        {/* ── The stage ─────────────────────────────────────────────────────
            The bulb hangs, the light falls, the app stands in it. Fixed height
            so the composition cannot be pushed around by copy length. */}
        <div className="relative h-[276px] w-full overflow-hidden">
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

          {/* The brand's own mark, not a bulb drawn for this file. A real ghost
              light is a lamp standing on the stage floor, which is what
              components/brand/GhostLight draws; the hand-made version hanging
              from the flies was a different object wearing the same name. */}
          <div className="absolute left-1/2 top-[18px] -translate-x-1/2">
            <GhostLight size="lg" />
          </div>

          {/* The app, standing in the light and cropped by the dark. Tilted a
              little so it is a thing on a stage rather than a screenshot pasted
              into a box.

              read.png is a marketing image, not a raw capture: it carries its own
              headline and the device does not begin until roughly 27% down. Shown
              whole at this size it is an illegible smudge of someone else's type.
              The negative offset pulls that headline out of frame so the crop
              starts at the phone's own top edge, which is also where the cream
              reading page begins — the one genuinely bright thing in the picture,
              and the reason the bulb above it has something to light. */}
          {/* Clickable for the same reason the teaser's phones now are: it is the
              most tappable-looking thing on the panel, and a picture of an app
              that does nothing when you touch it reads as broken. */}
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Get Ghost Light on the App Store"
            onClick={() => {
              remember();
              track("ghostlight_modal_accepted");
              setOpen(false);
            }}
            className="absolute left-1/2 top-[62px] w-[176px] -translate-x-1/2 rotate-[-3deg] transition-transform duration-200 hover:scale-[1.02]"
          >
            {/* Tall enough to read as a phone. At 120px of surviving height this
                was a card, and a card is not a thing anyone downloads. The page
                is now legible down to the second paragraph of the speech, which
                is the actual product: the words, set to be read. */}
            <div className="h-[248px] overflow-hidden rounded-[18px] border border-[var(--stage-line)] shadow-[0_20px_50px_-6px_rgba(0,0,0,0.9)]">
              <Image
                src="/ghostlight/read.png"
                alt="Ghost Light showing Nora's speech from A Doll's House on a warm paper page"
                width={680}
                height={1471}
                /* 176 wide renders 381 tall; the device begins at 27.5% of that. */
                className="w-full max-w-none"
                style={{ marginTop: "-105px" }}
                priority={false}
              />
            </div>
          </a>

          {/* Dark rising from the floor, so the phone dissolves into the stage
              instead of being guillotined by the panel edge. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
            style={{
              background:
                "linear-gradient(to top, var(--stage) 18%, color-mix(in oklab, var(--stage) 62%, transparent) 62%, transparent 100%)",
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
            {/* Reads properly before the count lands rather than flashing a zero
                or a dash, so a slow stats call costs nothing. */}
            {library ? (
              <>
                <span className="tabular-nums text-[var(--stage-fg)]">
                  {library.toLocaleString()}
                </span>{" "}
                monologues.
              </>
            ) : (
              "The whole library."
            )}{" "}
            Search by character, tone or length, keep what you find, and read it
            offline in the waiting room.
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
              {/* iPhone, not "iPhone and iPad". Apple lists 80 iPad devices as
                  supported, but that is compatibility mode: app.json sets
                  supportsTablet false, there are no iPad screenshots, and an
                  iPad Air is exactly where App Review found the paywall
                  overflowing. Promising iPad here would be selling a letterbox. */}
              <p className="text-[12px] leading-relaxed text-[var(--stage-muted)]">
                Point your phone&rsquo;s camera here.
                <span className="mt-0.5 block text-[var(--stage-faint)]">
                  iPhone. Free to start.
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
