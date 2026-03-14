"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
} from "framer-motion";
import { IconPlayerPlayFilled } from "@tabler/icons-react";

const YOUTUBE_ID = "TTZxo3bZPI4";

const spring = { stiffness: 100, damping: 30, restDelta: 0.001 };

export function LandingVideoShowcase() {
  const [playing, setPlaying] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  /* ── Scroll progress ── */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "center center"],
  });

  const smooth = useSpring(scrollYProgress, spring);

  /* ── Text: scroll-linked fade + rise ── */
  const titleY = useTransform(smooth, [0, 0.5], [60, 0]);
  const titleOpacity = useTransform(smooth, [0, 0.35], [0, 1]);
  const titleBlur = useTransform(smooth, [0, 0.3], [8, 0]);

  const subtitleY = useTransform(smooth, [0.05, 0.5], [40, 0]);
  const subtitleOpacity = useTransform(smooth, [0.05, 0.4], [0, 1]);

  const badgeOpacity = useTransform(smooth, [0, 0.25], [0, 1]);
  const badgeScale = useTransform(smooth, [0, 0.25], [0.9, 1]);

  /* ── Video card: 3D perspective + scale + lift ── */
  const cardScale = useTransform(smooth, [0, 1], [0.8, 1]);
  const cardY = useTransform(smooth, [0, 1], [120, 0]);
  const cardRotateX = useTransform(smooth, [0, 0.8, 1], [8, 2, 0]);
  const cardOpacity = useTransform(smooth, [0.1, 0.45], [0, 1]);
  const cardBorderRadius = useTransform(smooth, [0, 1], [40, 16]);

  /* ── Shimmer border ── */
  const shimmerRotate = useTransform(smooth, [0, 1], [0, 180]);

  return (
    <section
      ref={sectionRef}
      className="relative py-28 sm:py-36 md:py-44 border-t border-border/60 overflow-hidden"
    >
      {/* ── Subtle grid texture ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          {/* ── Title block — scroll-linked ── */}
          <div className="text-center mb-14 sm:mb-20">
            {/* Pill badge */}
            <motion.div
              style={{ opacity: badgeOpacity, scale: badgeScale }}
              className="mb-5 sm:mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              ScenePartner
            </motion.div>

            {/* Heading */}
            <div className="overflow-hidden">
              <motion.h2
                style={{
                  y: titleY,
                  opacity: titleOpacity,
                  filter: useTransform(titleBlur, (v) => `blur(${v}px)`),
                }}
                className="text-4xl sm:text-5xl md:text-6xl tracking-[-0.03em] font-medium"
              >
                Watch how it works.
              </motion.h2>
            </div>

            {/* Subtitle */}
            <motion.p
              style={{ y: subtitleY, opacity: subtitleOpacity }}
              className="mt-5 text-muted-foreground text-base sm:text-lg max-w-md mx-auto"
            >
              Rehearse with your scene partner, anytime.
            </motion.p>
          </div>

          {/* ── Video card ── */}
          <div style={{ perspective: "1200px" }}>
            <motion.div
              style={{
                scale: cardScale,
                y: cardY,
                rotateX: cardRotateX,
                opacity: cardOpacity,
                borderRadius: cardBorderRadius,
              }}
              className="relative"
            >
              {/* Shimmer border */}
              <motion.div
                style={{
                  borderRadius: cardBorderRadius,
                  background: useTransform(
                    shimmerRotate,
                    (r) =>
                      `conic-gradient(from ${r}deg, transparent 0%, rgba(255,255,255,0.08) 10%, transparent 20%, transparent 50%, rgba(255,255,255,0.04) 60%, transparent 70%)`
                  ),
                }}
                className="absolute -inset-[1px] z-0"
              />

              {/* Card inner */}
              <div
                className="relative z-10 overflow-hidden bg-black"
                style={{ borderRadius: "inherit" }}
              >
                <div
                  className="relative w-full"
                  style={{ aspectRatio: "16/9" }}
                >
                  {playing ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1`}
                      title="ScenePartner demo"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute -inset-[2%] w-[104%] h-[104%]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlaying(true)}
                      className="group absolute inset-0 w-full h-full cursor-pointer"
                      aria-label="Play ScenePartner demo video"
                    >
                      {/* Thumbnail */}
                      <img
                        src={`https://img.youtube.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`}
                        onError={(e) => {
                          e.currentTarget.src = `https://img.youtube.com/vi/${YOUTUBE_ID}/hqdefault.jpg`;
                        }}
                        alt="ScenePartner demo thumbnail"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                      />

                      {/* Cinematic vignette */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 group-hover:from-black/60 transition-all duration-700" />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10" />

                      {/* Play button */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative">
                          {/* Pulsing ring */}
                          <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 animate-ping [animation-duration:2s]" />
                          {/* Outer glow */}
                          <div className="absolute -inset-3 rounded-full bg-white/10 blur-md" />
                          {/* Button */}
                          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 backdrop-blur-md shadow-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-white transition-all duration-300">
                            <IconPlayerPlayFilled className="w-7 h-7 sm:w-8 sm:h-8 text-black/80 ml-0.5" />
                          </div>
                        </div>
                      </div>

                      {/* Duration badge */}
                      <div className="absolute bottom-4 sm:bottom-6 left-0 right-0 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-xs sm:text-sm text-white/80 font-medium">
                          1:30
                        </span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
