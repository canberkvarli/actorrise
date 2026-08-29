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
      aria-label="Ghost Light iOS app, coming soon"
    >
      <div className="container mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-8 sm:pb-10 text-center">
        <p className="stage-direction text-xs sm:text-sm text-[var(--stage-muted)]">
          (the ghost light goes home with you.)
        </p>

        <h2 className="mt-5 pb-2 font-brand font-medium tracking-[-0.02em] leading-[1.22] text-3xl sm:text-5xl md:text-6xl max-w-3xl mx-auto text-balance">
          The stage, <em className="italic text-primary">in your pocket</em>.
        </h2>

        <p className="mt-5 max-w-xl mx-auto text-sm sm:text-base text-[var(--stage-muted)] leading-relaxed">
          Ghost Light, the iOS app. The whole library, tone filters, overdone
          warnings, and a reading light built for dark wings and long train
          rides. Your saved pieces come with you, offline.
        </p>

        <p className="mt-7 inline-flex items-center gap-2.5 border border-[var(--stage-line)] bg-[var(--stage-raised)]/60 px-4 py-2 text-xs sm:text-sm text-[var(--stage-fg)]">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          In review at the App Store
          <span className="text-[var(--stage-faint)]">·</span>
          <span className="stage-direction text-[var(--stage-muted)]">(launching soon.)</span>
        </p>
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
