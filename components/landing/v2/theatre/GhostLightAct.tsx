"use client";

import Image from "next/image";
import { useRef } from "react";
import { appStoreUrl } from "@/lib/appStore";

/**
 * Ghost Light, the iOS app, with a room of its own. Until 2026-10-31 it was
 * three thumbnails at the foot of the curtain; the App Store set (Downloads/
 * export 3 and 6, 2026-10-27) is what the app actually looks like now, captions
 * and all, so the section is mostly those shots.
 *
 * The shots are painted on rgb(11 6 2). The section is the same colour, so
 * they sit on it with no frame, as if the strip were one long stage.
 */

const SHOTS = [
  { file: "01-scene", alt: "Your scene partner, any hour. It reads the other parts, you just act." },
  { file: "02-sides", alt: "Drop in your sides. PDF, Word or paste, it finds the cast. Pick your part." },
  { file: "03-board", alt: "Your week, on the board. A reminder the night before, straight to your piece." },
  { file: "04-call-sheet", alt: "Every call, on one sheet. Paste the casting email, it fills itself in." },
  { file: "05-how-did-it-go", alt: "How did it go? Callback, booked, waiting or passed. Write down what landed." },
  { file: "06-tonight", alt: "A new speech every night, one piece each evening on your home screen." },
  { file: "07-search", alt: "Say what you need. A grieving mother, something funny, under two minutes." },
  { file: "08-overdone", alt: "Know what's overdone first. Every piece is marked before the panel sees it." },
  { file: "09-reading", alt: "Sides, on paper. The whole speech, the way it was printed." },
  { file: "10-film-tv", alt: "Film and TV too. The screen shelf, scenes and speeches with their posters." },
];

const BG = "rgb(11 6 2)";

function AppleMark() {
  return (
    <svg viewBox="0 0 384 512" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

export function GhostLightAct() {
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
    <section
      id="ghost-light"
      className="relative overflow-hidden pb-[110px] pt-[110px]"
      style={{
        // The rooms either side are --t-stage; the shots need BG. Fade between.
        background: `linear-gradient(var(--t-stage), ${BG} 90px, ${BG} calc(100% - 90px), var(--t-stage))`,
        color: "var(--t-cream)",
      }}
    >
      {/* The lamp: one warm pool under the strip, gone before the edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[60px] h-[60%]"
        style={{ background: "radial-gradient(45% 50% at 50% 70%, oklch(0.72 0.17 55 / .16), transparent 75%)" }}
      />

      <div className="relative mx-auto max-w-[1240px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
          <div className="max-w-[720px]">
            <p className="t-dir" style={{ color: "var(--t-muted-light)" }}>
              (the house empties. one lamp stays lit on the stage.)
            </p>
            <h2 className="t-h2 mt-4">
              Ghost Light.{" "}
              <em className="t-em" style={{ color: "var(--t-orange)" }}>
                The whole rehearsal room, in your pocket.
              </em>
            </h2>
            <p className="m-0 mt-5 max-w-[56ch] text-[17px] leading-relaxed" style={{ color: "var(--t-muted-light-2)" }}>
              ActorRise on your iPhone. A scene partner at any hour, your sides read back, every audition on one
              board, and a new speech on your home screen each night. Saves work offline.
            </p>
          </div>

          <div className="flex items-center gap-5">
            <Image
              src="/ghostlight/appstore-qr.png"
              alt=""
              width={88}
              height={88}
              className="hidden bg-white p-1.5 md:block"
              style={{ imageRendering: "pixelated" }}
            />
            <div>
              <a
                href={appStoreUrl("landing_teaser")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-[15px] font-semibold transition-transform duration-300 hover:-translate-y-0.5"
                style={{ background: "var(--t-cream)", color: BG, transitionTimingFunction: "var(--t-spring)" }}
              >
                <AppleMark />
                Download on the App Store
              </a>
              <p className="m-0 mt-2 hidden text-[13px] md:block" style={{ color: "var(--t-muted-light)" }}>
                Or point your phone at the code.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* The strip. Full bleed, but the first shot lines up with the heading. */}
      <div
        ref={stripRef}
        className="relative mt-14 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          paddingInline: "max(24px, calc((100vw - 1240px) / 2 + 24px))",
          scrollPaddingInline: "max(24px, calc((100vw - 1240px) / 2 + 24px))",
        }}
        aria-label="Ghost Light screens"
      >
        {SHOTS.map((s, i) => (
          <figure
            key={s.file}
            className="m-0 shrink-0 snap-start"
            style={{
              width: "clamp(230px, 23vw, 300px)",
              // Each shot carries its own lamp glow and a soft vignette; feather
              // the edges so the strip reads as one stage, not ten tiles.
              maskImage:
                "linear-gradient(#000 74%, transparent), linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)",
              maskComposite: "intersect",
              WebkitMaskComposite: "source-in",
            }}
          >
            <Image
              src={`/ghostlight/shots/${s.file}.webp`}
              alt={s.alt}
              width={720}
              height={1565}
              sizes="(max-width: 1000px) 230px, 300px"
              loading={i < 4 ? "eager" : "lazy"}
              className="block h-auto w-full"
            />
          </figure>
        ))}
      </div>

      <div className="relative mx-auto mt-6 flex max-w-[1240px] items-center justify-between gap-4 px-6">
        <p className="t-dir m-0" style={{ color: "var(--t-muted-light)" }}>
          (ten screens. scroll along.)
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Earlier screens"
            className={arrow}
            style={{ border: "1.5px solid var(--t-cta-bd)" }}
          >
            <span aria-hidden>←</span>
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Later screens"
            className={arrow}
            style={{ border: "1.5px solid var(--t-cta-bd)" }}
          >
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
