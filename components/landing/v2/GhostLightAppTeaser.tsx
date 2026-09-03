"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

/**
 * Ghost Light iOS teaser: the app's own screens floating on the dark stage,
 * drifting at different speeds as you scroll past. Sits right before the
 * final CTA so the page ends on the dark with the app as the closer.
 */

/** Live since 2026-09-03. Verified: returns 200, "Ghost Light: Monologues App". */
export const APP_STORE_URL =
  "https://apps.apple.com/us/app/ghost-light-monologues/id6804278673";

const PHONES = [
  {
    src: "/ghostlight/read.png",
    alt: "Ghost Light reading view: Nora's doll-wife speech from A Doll's House on a warm paper background",
  },
  {
    src: "/ghostlight/search.png",
    alt: "Ghost Light search: describe the character, find the speech",
  },
  {
    src: "/ghostlight/saves.png",
    alt: "Ghost Light saved pieces: your book, offline, with off-book progress",
  },
];

const enter = {
  hidden: { opacity: 0, y: 48 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.14 },
  }),
};

export function GhostLightAppTeaser() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // Each phone drifts at its own rate so the group feels dimensional.
  const yLeft = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const yCenter = useTransform(scrollYProgress, [0, 1], [30, -30]);
  const yRight = useTransform(scrollYProgress, [0, 1], [95, -95]);
  const parallax = reduceMotion ? [undefined, undefined, undefined] : [yLeft, yCenter, yRight];

  // Center phone leans a few degrees toward the cursor.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springX = useSpring(tiltX, { stiffness: 120, damping: 18 });
  const springY = useSpring(tiltY, { stiffness: 120, damping: 18 });

  const handleTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const r = e.currentTarget.getBoundingClientRect();
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 7);
    tiltX.set(((e.clientY - r.top) / r.height - 0.5) * -7);
  };
  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <section
      ref={ref}
      className="relative isolate overflow-hidden stage-grain"
      aria-label="Ghost Light iOS app on the App Store"
    >
      <div className="container mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-8 sm:pb-10 text-center">
        <p className="stage-direction text-xs sm:text-sm text-[var(--stage-muted)]">
          (the ghost light goes home with you.)
        </p>

        <h2 className="mt-5 pb-2 font-brand font-medium leading-[1.22] text-3xl sm:text-5xl md:text-6xl max-w-3xl mx-auto text-balance">
          The stage, <em className="italic text-primary">in your pocket</em>.
        </h2>

        <p className="mt-5 max-w-xl mx-auto text-sm sm:text-base text-[var(--stage-muted)] leading-relaxed">
          Ghost Light, the iOS app. The whole library, tone filters, overdone
          warnings, and a reading light built for dark wings and long train
          rides. Your saved pieces come with you, offline.
        </p>

        {/* It is out. This was a status line — "In review at the App Store"
            beside a pinging dot — which was true until it shipped and then
            quietly became a lie on the live site. A pulsing dot means waiting;
            a released app should not be wearing one. It is a link now, and the
            only thing on this section you can click. */}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-primary-solid px-5 py-2.5 text-sm font-semibold text-primary-solid-foreground shadow-lg shadow-black/20 transition-transform hover:scale-[1.03] active:scale-95"
        >
          <svg aria-hidden viewBox="0 0 384 512" className="h-4 w-4" fill="currentColor">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          </svg>
          Download on the App Store
        </a>
      </div>

      {/* The three screens, drifting over the glow */}
      <div className="relative mt-6 sm:mt-10 pb-20 sm:pb-28">
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full animate-glow-breathe"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--stage-glow) 22%, transparent), transparent 70%)",
          }}
        />

        <div
          onMouseMove={handleTilt}
          onMouseLeave={resetTilt}
          className="container mx-auto px-4 sm:px-6 flex items-start justify-center gap-4 sm:gap-8 [perspective:1200px]"
        >
          {PHONES.map((phone, i) => {
            const isCenter = i === 1;
            return (
              <motion.div
                key={phone.src}
                custom={i}
                variants={enter}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                style={
                  isCenter
                    ? { y: parallax[i], rotateX: springX, rotateY: springY }
                    : { y: parallax[i] }
                }
                className={
                  isCenter
                    ? "relative z-10 w-[46%] max-w-[280px] sm:max-w-[330px]"
                    : `relative w-[34%] max-w-[215px] sm:max-w-[250px] mt-10 sm:mt-16 ${
                        i === 0 ? "-rotate-[5deg]" : "rotate-[5deg]"
                      } hidden min-[420px]:block`
                }
              >
                <div
                  className={`overflow-hidden rounded-[1.6rem] sm:rounded-[2rem] border border-[var(--stage-line)] bg-[var(--stage-deep)] ${
                    isCenter
                      ? "shadow-[0_24px_80px_-16px_color-mix(in_oklab,var(--stage-glow)_38%,transparent)]"
                      : "shadow-[0_18px_60px_-20px_rgba(0,0,0,0.8)] opacity-85"
                  }`}
                >
                  {/* unoptimized: Next clamps quality to its config allowlist and
                      served a 384px q75 webp — mush. These are pre-scaled 2x PNGs. */}
                  <Image
                    src={phone.src}
                    alt={phone.alt}
                    width={680}
                    height={1471}
                    unoptimized
                    className="block h-auto w-full"
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
