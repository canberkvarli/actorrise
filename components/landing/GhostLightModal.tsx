"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
 * Three rules this obeys, because an app-download modal is otherwise the most
 * disliked pattern on the mobile web:
 *
 * 1. LANDING PAGE ONLY. Google penalises intrusive interstitials on mobile and
 *    app-download popups are the textbook case. This site lives on 1,281 SEO
 *    landing pages, mostly individual monologues, and putting this on those would
 *    risk the channel that feeds everything to win a secondary conversion. The
 *    monologue pages get Apple's Smart App Banner instead, which Google exempts.
 * 2. IT WAITS. Not on arrival. Either fifteen seconds or a third of the way down,
 *    whichever comes first, so it only interrupts someone who stayed. Firing at
 *    zero seconds asks for a download from a person who does not yet know what
 *    this site is.
 * 3. ONCE, EVER. Dismissed is remembered. A modal that returns is a tax.
 *
 * It also never shows where it cannot convert: Android sees nothing, because the
 * app is iOS-only and an advert for something you cannot install is just noise.
 * Desktop gets a QR code rather than a dead "Get it free" button, because the
 * phone that would install it is in their pocket, not on their desk.
 */

const DISMISS_KEY = "ar_ghostlight_modal_v1";
const DELAY_MS = 15_000;
const SCROLL_FRACTION = 0.33;

type Platform = "ios" | "desktop" | "none";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "none";
  const ua = navigator.userAgent;
  // The app is iOS-only. Android is deliberately shown nothing at all.
  if (/Android/i.test(ua)) return "none";
  // iPadOS 13+ reports itself as a Mac and is only distinguishable by the touch
  // points. Without this an iPad gets the desktop QR code and is told to scan it
  // with the very device it is already holding.
  const isIpadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIpadOS) return "ios";
  return "desktop";
}

/** Fire-and-forget; the page must not care whether analytics exists. */
function track(event: string) {
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.(
      "event",
      event,
      { app_id: "6804278673" },
    );
  } catch {
    /* never let a missing tag break the page */
  }
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

    // Whichever arrives first. Both are engagement signals; the timer catches
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
      <DialogContent className="max-w-[380px] gap-5 rounded-2xl p-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="space-y-5"
        >
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-lg font-semibold leading-tight">
              Ghost Light is on the App Store
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              The whole library in your pocket. Search by character, tone or
              length, keep what you find, and read it offline in the waiting room.
            </DialogDescription>
          </DialogHeader>

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
              className="flex w-full items-center justify-center rounded-xl bg-primary-solid px-4 py-3 text-sm font-medium text-primary-solid-foreground transition-opacity hover:opacity-90"
            >
              Get it free
            </a>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {/* A desktop visitor cannot install an iPhone app. Sending them to
                  a web App Store page is a dead end, so point the phone in their
                  pocket at this instead. */}
              <Image
                src="/ghostlight/appstore-qr.png"
                alt="QR code linking to Ghost Light: Monologues on the App Store"
                width={148}
                height={148}
                className="rounded-lg bg-white p-2"
                unoptimized
              />
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Point your phone&rsquo;s camera at this to open it on the App
                Store.
              </p>
            </div>
          )}

          <p className="text-center text-[11px] text-muted-foreground">
            Free to start. iPhone and iPad.
          </p>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

export default GhostLightModal;
