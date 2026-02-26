"use client";

/**
 * Testimonials carousel: one featured testimonial with portrait headshot.
 * Dots are section background only. Headshots: public/testimonials/. Data: data/testimonials.ts.
 */

import { useAuthModal } from "@/components/auth/AuthModalContext";
import { ContactModal } from "@/components/contact/ContactModal";
import {
  TESTIMONIALS,
  type TestimonialItem,
} from "@/data/testimonials";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ChevronLeft, ChevronRight, UserPlus } from "lucide-react";

export type { TestimonialItem };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** Choose quote font size based on length so it fits card height without trimming. */
function getQuoteSizeClasses(quote: string): string {
  const len = quote.length;

  // Short blurbs: keep original comfortable sizes
  if (len <= 260) {
    return "text-sm md:text-base lg:text-lg";
  }

  // Medium: nudge down slightly
  if (len <= 420) {
    return "text-xs sm:text-sm md:text-base";
  }

  // Long (rare once we enforce character limits): one more step down, but still readable
  return "text-xs sm:text-xs md:text-sm";
}

const DOT_GRID_SIZE = 16;

/** Dot pattern (dots everywhere). Use className for color, e.g. text-primary/20. */
function DotPatternBackground({ className }: { className?: string }) {
  return (
    <div
      className={className}
      aria-hidden
      style={{
        backgroundImage: `radial-gradient(circle at center, currentColor 1.5px, transparent 1.5px)`,
        backgroundSize: `${DOT_GRID_SIZE}px ${DOT_GRID_SIZE}px`,
        backgroundPosition: "0 0",
      }}
    />
  );
}

/** Full-section dot pattern: orange theme, fades toward edges. */
function SectionDotPattern() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none text-primary/20"
      aria-hidden
      style={{
        maskImage: "radial-gradient(ellipse 90% 85% at 50% 45%, black 15%, transparent 65%)",
        WebkitMaskImage: "radial-gradient(ellipse 90% 85% at 50% 45%, black 15%, transparent 65%)",
      }}
    >
      <DotPatternBackground className="absolute inset-0" />
    </div>
  );
}

/** Actor headshot: portrait 8×10. Tall, theater-style image on web. */
function TestimonialHeadshot({
  name,
  image,
  onPlaceholderClick,
}: {
  name: string;
  image?: string;
  onPlaceholderClick?: () => void;
}) {
  const ring = "ring-2 ring-border/50 shadow-lg";

  if (image) {
    return (
      <div className="relative shrink-0 w-[280px] h-[350px] sm:w-[320px] sm:h-[400px] md:w-[380px] md:h-[475px] mx-auto md:mx-0">
        <div className={`w-full h-full rounded-lg overflow-hidden bg-muted ${ring}`}>
          <Image
            src={image}
            alt=""
            width={380}
            height={475}
            className="object-cover w-full h-full object-top"
            sizes="(max-width: 640px) 280px, (max-width: 768px) 320px, 380px"
          />
        </div>
      </div>
    );
  }

  const inner = (
    <div
      className={`w-full h-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 flex items-center justify-center text-muted-foreground ${ring} transition-all duration-300 ease-out group-hover:border-primary/50 group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-[1.02] group-active:scale-[0.99]`}
    >
      <UserPlus className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 transition-transform duration-300 group-hover:scale-110" />
    </div>
  );

  if (onPlaceholderClick) {
    return (
      <button
        type="button"
        onClick={onPlaceholderClick}
        aria-label="Contact for a code"
        className="relative shrink-0 w-[280px] h-[350px] sm:w-[320px] sm:h-[400px] md:w-[380px] md:h-[475px] mx-auto md:mx-0 block group focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background rounded-lg"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="relative shrink-0 w-[280px] h-[350px] sm:w-[320px] sm:h-[400px] md:w-[380px] md:h-[475px] mx-auto md:mx-0">
      {inner}
    </div>
  );
}


/** Small avatar for thumbnail strip: headshot or initials. */
function ThumbnailDot({
  testimonial,
  isActive,
  onClick,
}: {
  testimonial: TestimonialItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const size = "w-8 h-8 sm:w-9 sm:h-9";
  const baseClasses = `${size} shrink-0 rounded-full border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 hover:scale-110 hover:shadow-[0_0_20px_rgba(0,0,0,0.15)] hover:shadow-primary/10`;
  if (testimonial.image) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`View testimonial from ${testimonial.name}`}
        className={`${baseClasses} overflow-hidden ${
          isActive ? "border-primary ring-2 ring-primary/30 scale-110" : "border-transparent hover:border-muted-foreground/30"
        }`}
      >
        <Image
          src={testimonial.image}
          alt=""
          width={44}
          height={44}
          className="object-cover w-full h-full object-top"
        />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${testimonial.name}`}
      className={`${baseClasses} border-dashed bg-muted/20 text-muted-foreground flex items-center justify-center ${
        isActive ? "border-primary ring-2 ring-primary/30 scale-110 text-primary" : "border-muted-foreground/40 hover:border-muted-foreground/50 hover:text-primary/80"
      }`}
    >
      <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
    </button>
  );
}

export function LandingTestimonials() {
  const [index, setIndex] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);
  const total = TESTIMONIALS.length;
  const t = TESTIMONIALS[index];
  const authModal = useAuthModal();
  const isPlaceholder = !t.image;

  const goPrev = () => setIndex((i) => (i === 0 ? total - 1 : i - 1));
  const goNext = () => setIndex((i) => (i === total - 1 ? 0 : i + 1));

  return (
    <>
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} initialCategory="other" />
    <section
      className="relative border-t border-border/60 py-16 md:py-20 bg-background overflow-hidden"
      aria-label="What actors are saying"
    >
      <SectionDotPattern />
      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Heading: compact, one idea per line */}
          <div className="text-center md:text-left">
            <motion.p
              className="font-brand text-xl sm:text-2xl md:text-3xl tracking-tight font-semibold text-foreground"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
            >
              What actors are saying
            </motion.p>
            <motion.p
              className="mt-1 text-muted-foreground text-sm md:text-base"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1], delay: 0.06 }}
            >
              Real actors. Real feedback.
            </motion.p>
          </div>

          {/* Layout: mobile column (photo first, then card); desktop row (headshot left, card right). Card fixed size so it never shifts. */}
          <div className="mt-8 md:mt-10 flex flex-col md:flex-row md:items-start gap-6 md:gap-8 max-w-5xl">
            <div className="flex justify-center md:block md:relative md:-left-2 md:z-10">
              <TestimonialHeadshot
                name={t.name}
                image={t.image}
                onPlaceholderClick={isPlaceholder ? () => setContactOpen(true) : undefined}
              />
            </div>

            {/* Fixed-size card: same dimensions on all breakpoints so switching testimonials doesn’t resize. Text uses dynamic font + scroll. */}
            <div
              className="flex-none md:flex-1 min-w-0 relative rounded-2xl border border-border/60 bg-card shadow-lg p-6 sm:p-8 md:p-10 flex flex-col h-[320px] min-h-[320px] max-h-[320px]"
            >
              <span
                className="absolute top-4 left-4 sm:top-6 sm:left-6 text-4xl sm:text-5xl font-serif text-muted-foreground/30 leading-none select-none pointer-events-none"
                aria-hidden
              >
                &ldquo;
              </span>

              <AnimatePresence mode="wait">
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  className="relative pl-6 sm:pl-8 flex flex-col flex-1 min-h-0 overflow-y-auto"
                >
                  <p
                    className={`text-foreground leading-relaxed font-medium ${getQuoteSizeClasses(
                      t.quote,
                    )}`}
                  >
                    {t.quote}
                  </p>
                  <div className="mt-2 sm:mt-3 shrink-0">
                    <p className="text-sm sm:text-base font-semibold text-foreground">
                      {t.name}
                    </p>
                    {!isPlaceholder && t.descriptor && (
                      <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                        {t.descriptor}
                      </p>
                    )}
                    {isPlaceholder && (
                      <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => setContactOpen(true)}
                          className="font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
                        >
                          Contact me for a code
                        </button>
                        {authModal && (
                          <>
                            {" or "}
                            <button
                              type="button"
                              onClick={() => authModal.openAuthModal("signup")}
                              className="font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
                            >
                              Join ActorRise →
                            </button>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Thumbnail strip */}
          <div className="mt-6 flex items-center justify-center gap-2 w-full max-w-4xl mx-auto">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous testimonial"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-border/60 bg-background/80 hover:bg-muted hover:border-primary/30 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div
              className="flex-1 min-w-0 max-w-xl overflow-x-auto overflow-y-hidden py-3 flex items-center gap-2 sm:gap-2.5 justify-center transition-transform duration-300 md:[transform:perspective(700px)_rotateX(5deg)]"
            >
              {TESTIMONIALS.map((item, i) => (
                <ThumbnailDot
                  key={`${item.name}-${i}`}
                  testimonial={item}
                  isActive={i === index}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next testimonial"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-border/60 bg-background/80 hover:bg-muted hover:border-primary/30 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
    </>
  );
}
