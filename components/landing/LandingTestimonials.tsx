"use client";

/**
 * Testimonials / social proof. Three equal cards (founder + actors).
 * Title in brand serif; quote and attribution in sans for readability.
 */

import Image from "next/image";
import { motion } from "framer-motion";

export interface TestimonialItem {
  quote: string;
  name: string;
  descriptor: string;
  image?: string;
  isFounder?: boolean;
}

const TESTIMONIALS: TestimonialItem[] = [
  {
    quote:
      "After years of hunting through tiny databases and random PDFs for audition pieces, I wanted a calmer, faster way to find work that actually fit. ActorRise is that tool.",
    name: "Canberk Varli",
    descriptor: "Founder and actor",
    image: "/canberk.jpeg",
    isFounder: true,
  },
  {
    quote:
      "I had a shortlist in under a minute. The search actually understood what I was asking for.",
    name: "Actor",
    descriptor: "Drama school audition",
  },
  {
    quote: "Used it for a film callback and found a scene that fit the brief in seconds.",
    name: "Actor",
    descriptor: "Screen actor",
  },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function TestimonialAvatar({
  name,
  image,
}: {
  name: string;
  image?: string;
}) {
  const sizeClass = "w-12 h-12 md:w-14 md:h-14 text-base md:text-lg";

  if (image) {
    return (
      <div
        className={`relative shrink-0 rounded-full overflow-hidden bg-muted ${sizeClass}`}
      >
        <Image
          src={image}
          alt=""
          width={56}
          height={56}
          className="object-cover w-full h-full"
        />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center ${sizeClass}`}
      aria-hidden
    >
      {getInitials(name)}
    </div>
  );
}

const stagger = 0.1;
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay: i * stagger },
  }),
};

export function LandingTestimonials() {
  return (
    <section
      className="border-t border-border/60 py-24 md:py-32 bg-background"
      aria-label="What actors are saying"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            className="font-brand text-3xl md:text-4xl lg:text-5xl tracking-tight font-semibold text-foreground"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
          >
            What actors are saying
          </motion.h2>
          <motion.p
            className="mt-3 text-muted-foreground text-base md:text-lg"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1], delay: stagger }}
          >
            From early users and the community. Real actors, real feedback.
          </motion.p>

          <div className="mt-12 md:mt-14 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-stretch">
            {TESTIMONIALS.map((t, i) => (
              <motion.article
                key={`${t.name}-${i}`}
                custom={i}
                variants={itemVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                className="h-full rounded-2xl border border-border/60 bg-card/40 p-8 md:p-10 hover:bg-card/60 hover:border-primary/20 transition-colors duration-200 flex flex-col min-h-0"
              >
                <p className="text-lg md:text-xl text-foreground leading-relaxed font-medium flex-1 min-h-0">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3 shrink-0 min-h-[3.5rem]">
                  <TestimonialAvatar name={t.name} image={t.image} />
                  <div>
                    <p className="text-base md:text-lg font-medium text-foreground">
                      {t.name}
                    </p>
                    {t.descriptor && (
                      <p className="mt-0.5 text-base text-muted-foreground/90">
                        {t.descriptor}
                      </p>
                    )}
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
