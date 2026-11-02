"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { appStoreUrl } from "@/lib/appStore";
import { useT, useTList } from "@/lib/i18n";
import { useReducedMotion } from "./useReducedMotion";
import { useScrollProgress } from "./useScrollProgress";

/**
 * Ghost Light, the iOS app, with a room of its own. The panels are the App
 * Store set (2026-10-27), captions and all, painted on rgb(11 6 2); the section
 * is that colour so they sit on it with no frame.
 *
 * Desktop: the panels stand in a stack like flats in the wings, and scrolling
 * flies the front one out to the loft and brings the next one down. The list on
 * the left is the running order, lit for the panel on stage. Phones, and anyone
 * who asked for less motion, get a strip to swipe instead: useScrollProgress
 * answers reduced motion with "all the way through", which here would fly every
 * flat out and leave an empty stage.
 */

/** Names and alt text live in the dictionary (landingGhost.shotNames /
    shotAlts), in this same order. */
const SHOTS = [
  { file: "01-scene" },
  { file: "02-sides" },
  { file: "03-board" },
  { file: "04-call-sheet" },
  { file: "05-how-did-it-go" },
  { file: "06-tonight" },
  { file: "07-search" },
  { file: "08-overdone" },
  { file: "09-reading" },
  { file: "10-film-tv" },
];

const N = SHOTS.length;
const BG = "rgb(11 6 2)";
/** Scroll spent on each panel, in viewport heights. */
const STEP_VH = 62;

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

function AppleMark() {
  return (
    <svg viewBox="0 0 384 512" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function StoreButton() {
  const t = useT();
  return (
    <a
      href={appStoreUrl("landing_teaser")}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-[15px] font-semibold transition-transform duration-300 hover:-translate-y-0.5"
      style={{ background: "var(--t-cream)", color: BG, transitionTimingFunction: "var(--t-spring)" }}
    >
      <AppleMark />
      {t("landingGhost.download")}
    </a>
  );
}

function Heading({ compact }: { compact?: boolean }) {
  const t = useT();
  return (
    <>
      <p className="t-dir" style={{ color: "var(--t-muted-light)" }}>
        {t("landingGhost.direction")}
      </p>
      <h2 className="t-h2 mt-4" style={compact ? { fontSize: "clamp(40px, 4.6vw, 68px)" } : undefined}>
        {t("landingGhost.titleA")}
        <em className="t-em" style={{ color: "var(--t-orange)" }}>
          {t("landingGhost.titleB")}
        </em>
      </h2>
    </>
  );
}

/** The phone version, and the one for reduced motion: a strip to swipe. */
function Strip() {
  const t = useT();
  const alts = useTList()("landingGhost.shotAlts");
  const stripRef = useRef<HTMLDivElement>(null);
  const step = (dir: 1 | -1) => {
    const el = stripRef.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.offsetWidth + 8) * 2, behavior: "smooth" });
  };
  const arrow =
    "inline-flex size-11 items-center justify-center rounded-full transition-colors hover:!border-[var(--t-gel)] hover:!text-[var(--t-gel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

  return (
    <div className="py-[100px]">
      <div className="mx-auto max-w-[1240px] px-6">
        <div className="max-w-[720px]">
          <Heading />
          <p className="m-0 mt-5 max-w-[56ch] text-[17px] leading-relaxed" style={{ color: "var(--t-muted-light-2)" }}>
            {t("landingGhost.body")}
          </p>
          <div className="mt-7">
            <StoreButton />
          </div>
        </div>
      </div>

      <div
        ref={stripRef}
        className="relative mt-12 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          paddingInline: "max(24px, calc((100vw - 1240px) / 2 + 24px))",
          scrollPaddingInline: "max(24px, calc((100vw - 1240px) / 2 + 24px))",
        }}
        aria-label={t("landingGhost.screensLabel")}
      >
        {SHOTS.map((s, i) => (
          <figure
            key={s.file}
            className="m-0 shrink-0 snap-start"
            style={{
              width: "clamp(230px, 23vw, 300px)",
              // Each shot carries its own glow and vignette; feather the edges
              // so the strip reads as one stage, not ten tiles.
              maskImage:
                "linear-gradient(#000 74%, transparent), linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)",
              maskComposite: "intersect",
              WebkitMaskComposite: "source-in",
            }}
          >
            <Image
              src={`/ghostlight/shots/${s.file}.webp`}
              alt={alts[i]}
              width={720}
              height={1565}
              sizes="(max-width: 1000px) 230px, 300px"
              loading={i < 3 ? "eager" : "lazy"}
              className="block h-auto w-full"
            />
          </figure>
        ))}
      </div>

      <div className="mx-auto mt-6 flex max-w-[1240px] items-center justify-between gap-4 px-6">
        <p className="t-dir m-0" style={{ color: "var(--t-muted-light)" }}>
          {t("landingGhost.swipe")}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => step(-1)} aria-label={t("landingGhost.earlier")} className={arrow} style={{ border: "1.5px solid var(--t-cta-bd)" }}>
            <span aria-hidden>←</span>
          </button>
          <button type="button" onClick={() => step(1)} aria-label={t("landingGhost.later")} className={arrow} style={{ border: "1.5px solid var(--t-cta-bd)" }}>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ease each change of panel and hold it still for a beat on either side. */
function stagePosition(p: number): number {
  const t = p * (N - 1);
  const f = Math.min(N - 1, Math.floor(t));
  const frac = Math.min(1, Math.max(0, (t - f - 0.2) / 0.6));
  return f + frac * frac * (3 - 2 * frac);
}

/** Desktop: the flats in the wings. */
function Wings() {
  const t = useT();
  const tList = useTList();
  const names = tList("landingGhost.shotNames");
  const alts = tList("landingGhost.shotAlts");
  const flats = useRef<(HTMLDivElement | null)[]>([]);
  const meter = useRef<HTMLDivElement>(null);
  const shownRef = useRef(0);
  const [shown, setShown] = useState(0);

  const apply = useCallback((p: number) => {
    const pos = stagePosition(p);
    flats.current.forEach((el, i) => {
      if (!el) return;
      const d = i - pos;
      if (d < 0) {
        // Flown: up into the loft, tipping a little as the lines take it.
        const k = Math.min(1, -d);
        // Gone by halfway, so its foot never lies over the next flat's title.
        el.style.transform = `translate3d(0, ${-k * 118}vh, 0) rotate(${-k * 5}deg)`;
        el.style.opacity = String(Math.max(0, 1 - k * 3));
        el.style.filter = "";
      } else {
        // Waiting in the wings: stepped back and to the right, in shadow.
        const w = Math.min(d, 3.5);
        el.style.transform = `translate3d(${w * 26}%, 0, 0) scale(${1 - w * 0.085})`;
        el.style.opacity = d > 3.4 ? "0" : "1";
        el.style.filter = `brightness(${1 - Math.min(d, 1) * 0.45 - Math.max(0, d - 1) * 0.12})`;
      }
    });
    meter.current?.style.setProperty("--gl-meter", String(p));
    const now = Math.round(pos);
    if (now !== shownRef.current) {
      shownRef.current = now;
      setShown(now);
    }
  }, []);
  const rigRef = useScrollProgress(apply);

  const goTo = (i: number) => {
    const el = rigRef.current;
    if (!el) return;
    const travel = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (i / (N - 1)) * travel, behavior: "smooth" });
  };

  return (
    <div
      ref={rigRef as React.RefObject<HTMLDivElement>}
      className="relative"
      style={{ height: `calc(100vh + ${(N - 1) * STEP_VH}vh)` }}
    >
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        {/* The lamp, low and centre stage behind the flats. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(38% 45% at 68% 78%, oklch(0.72 0.17 55 / .16), transparent 75%)" }}
        />

        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)_auto] items-center gap-10 px-6 pt-[84px]">
          <div className="min-w-0 max-w-[520px]">
            <Heading compact />

            <ol className="m-0 mt-7 list-none p-0" aria-label={t("landingGhost.inTheApp")}>
              {SHOTS.map((s, i) => {
                const on = i === shown;
                return (
                  <li key={s.file}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={on ? "step" : undefined}
                      className="group flex w-full items-baseline gap-3 py-[5px] text-left transition-colors duration-300"
                      style={{ color: on ? "var(--t-cream)" : "var(--t-muted-light)" }}
                    >
                      <span
                        className="w-8 shrink-0 text-right text-[13px] transition-colors duration-300"
                        style={{ fontFamily: "var(--t-direction)", color: on ? "var(--t-orange)" : undefined }}
                      >
                        {ROMAN[i]}.
                      </span>
                      <span
                        className="text-[17px] leading-tight transition-transform duration-300 group-hover:translate-x-1"
                        style={{
                          fontFamily: on ? "var(--t-display)" : undefined,
                          fontStyle: on ? "italic" : undefined,
                          fontSize: on ? 22 : undefined,
                          transitionTimingFunction: "var(--t-spring)",
                        }}
                      >
                        {names[i]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 flex items-center gap-5">
              <StoreButton />
              <Image
                src="/ghostlight/appstore-qr.png"
                alt=""
                width={64}
                height={64}
                className="bg-white p-1"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          </div>

          {/* The wings. Each flat is the panel's own size; the stack runs off to the right. */}
          <div
            className="relative"
            style={{ height: "min(74vh, 720px)", width: "calc(min(74vh, 720px) * 0.46 * 1.75)" }}
          >
            {SHOTS.map((s, i) => (
              <div
                key={s.file}
                ref={(el) => {
                  flats.current[i] = el;
                }}
                className="absolute left-0 top-0 h-full will-change-transform"
                style={{
                  aspectRatio: "720 / 1565",
                  zIndex: N - i,
                  transformOrigin: "left center",
                  transform: i === 0 ? undefined : `translate3d(${Math.min(i, 3.5) * 26}%, 0, 0) scale(${1 - Math.min(i, 3.5) * 0.085})`,
                  opacity: i > 3 ? 0 : 1,
                  maskImage:
                    "linear-gradient(#000 80%, transparent), linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)",
                  maskComposite: "intersect",
                  WebkitMaskComposite: "source-in",
                }}
              >
                <Image
                  src={`/ghostlight/shots/${s.file}.webp`}
                  alt={alts[i]}
                  width={720}
                  height={1565}
                  sizes="340px"
                  loading={i < 3 ? "eager" : "lazy"}
                  className="block h-full w-auto"
                />
              </div>
            ))}

            {/* How far through the running order. */}
            <div
              ref={meter}
              aria-hidden
              className="absolute -bottom-6 left-0 h-px w-[46%]"
              style={{ background: "var(--t-line-dark-3)" }}
            >
              <div
                className="h-full origin-left"
                style={{ background: "var(--t-orange)", transform: "scaleX(var(--gl-meter, 0))" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GhostLightAct() {
  const reduced = useReducedMotion();

  return (
    <section
      id="ghost-light"
      className="relative"
      style={{
        // The rooms either side are --t-stage; the panels need BG. Fade between.
        background: `linear-gradient(var(--t-stage), ${BG} 90px, ${BG} calc(100% - 90px), var(--t-stage))`,
        color: "var(--t-cream)",
      }}
    >
      <div className={reduced ? "overflow-hidden" : "overflow-hidden md:hidden"}>
        <Strip />
      </div>
      {!reduced && (
        <div className="hidden md:block">
          <Wings />
        </div>
      )}
    </section>
  );
}
