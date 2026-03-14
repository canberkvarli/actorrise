"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
} from "framer-motion";

const spring = { stiffness: 100, damping: 30, restDelta: 0.001 };

export function LandingSearchShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInView = useInView(videoRef, { once: false, margin: "-100px" });

  /* ── Scroll progress ── */
  /* offset: section bottom touching viewport bottom → section 40% into viewport
     This means nothing starts until the section is well on screen. */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end end"],
  });

  const smooth = useSpring(scrollYProgress, spring);

  /* ── Badge animations (first element, leads the stagger) ── */
  const badgeY = useTransform(smooth, [0.12, 0.4], [30, 0]);
  const badgeOpacity = useTransform(smooth, [0.12, 0.3], [0, 1]);
  const badgeScale = useTransform(smooth, [0.12, 0.3], [0.9, 1]);

  /* ── Heading (slightly after badge) ── */
  const headingY = useTransform(smooth, [0.16, 0.45], [40, 0]);
  const headingOpacity = useTransform(smooth, [0.16, 0.35], [0, 1]);
  const headingBlur = useTransform(smooth, [0.16, 0.32], [6, 0]);

  /* ── Description (after heading) ── */
  const descY = useTransform(smooth, [0.2, 0.5], [30, 0]);
  const descOpacity = useTransform(smooth, [0.2, 0.4], [0, 1]);

  /* ── CTA button (last text element) ── */
  const ctaY = useTransform(smooth, [0.24, 0.52], [25, 0]);
  const ctaOpacity = useTransform(smooth, [0.24, 0.44], [0, 1]);

  /* ── Video card animations (trails all text) ── */
  const videoY = useTransform(smooth, [0.2, 0.6], [80, 0]);
  const videoOpacity = useTransform(smooth, [0.2, 0.5], [0, 1]);
  const videoScale = useTransform(smooth, [0.2, 0.6], [0.92, 1]);
  const videoRotateX = useTransform(smooth, [0.2, 0.6], [6, 0]);

  /* ── Auto-play/pause on visibility ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 0.75;
    if (isInView) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isInView]);

  return (
    <section
      ref={sectionRef}
      className="relative py-20 sm:py-28 md:py-36 border-t border-border/60 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Side-by-side: text left, video right ── */}
        {/* Stacks on mobile, side-by-side on lg+ */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-14">
          {/* ── Text column: ~35%, staggered scroll reveals ── */}
          <div className="lg:w-[35%] shrink-0">
            {/* Badge */}
            <motion.div
              style={{ y: badgeY, opacity: badgeOpacity, scale: badgeScale }}
              className="mb-5"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                AI-powered search
              </div>
            </motion.div>

            {/* Heading */}
            <motion.h2
              style={{
                y: headingY,
                opacity: headingOpacity,
                filter: useTransform(headingBlur, (v) => `blur(${v}px)`),
              }}
              className="text-3xl sm:text-4xl lg:text-5xl tracking-[-0.03em] font-medium leading-[1.1]"
            >
              Find your piece in seconds.
            </motion.h2>

            {/* Description */}
            <motion.p
              style={{ y: descY, opacity: descOpacity }}
              className="mt-4 text-muted-foreground text-sm sm:text-base leading-relaxed"
            >
              Describe what you need in plain English. Filter by tone, age, genre, source, and overdone status.
            </motion.p>

            {/* CTA */}
            <motion.div
              style={{ y: ctaY, opacity: ctaOpacity }}
              className="mt-7"
            >
              <Button asChild size="lg" className="rounded-full px-8">
                <Link href="/search">Try it free</Link>
              </Button>
            </motion.div>
          </div>

          {/* ── Video column: ~65% ── */}
          <div className="lg:w-[65%] min-w-0" style={{ perspective: "1200px" }}>
            <motion.div
              style={{
                y: videoY,
                opacity: videoOpacity,
                scale: videoScale,
                rotateX: videoRotateX,
              }}
            >
              <div className="rounded-2xl border border-border/60 overflow-hidden shadow-lg bg-black">
                <video
                  ref={videoRef}
                  src="/videos/MonologueSearch.mp4"
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-auto"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
