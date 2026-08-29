"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

const FAQ_ITEMS = [
  {
    q: "Is the search really AI?",
    a: "Yes, the search is AI. ActorRise runs semantic (AI) search over 12,000+ real monologues from plays, films, and TV, so you can describe what you need in plain English. The AI only finds the piece. The monologue text itself is the original published work, never AI-generated or invented.",
  },
  {
    q: "Where do the monologues come from?",
    a: "Every piece links back to its source and original publication (e.g. Project Gutenberg and similar). We never host full scripts of copyrighted works. Full details: ",
    link: { href: "/sources", label: "Sources & copyright" },
  },
  {
    q: "Is my data private?",
    a: "We don't sell your data. Your searches are private and used only to provide the service and improve search quality.",
  },
  {
    q: "How do I cancel?",
    a: "Cancel anytime from your account or billing page. No long-term commitment.",
  },
];

// FAQPage structured data, built from the same items shown below so the schema
// never drifts from the visible content (a Google rich-results requirement).
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.link ? `${item.a}${item.link.label}.` : item.a,
    },
  })),
};

const EASE = [0.22, 1, 0.36, 1] as const;

function FaqItem({
  item,
  open,
  onToggle,
  id,
}: {
  item: (typeof FAQ_ITEMS)[number];
  open: boolean;
  onToggle: () => void;
  id: string;
}) {
  return (
    <li
      className={`rounded-lg border overflow-hidden transition-colors duration-300 ${
        open ? "border-primary/35 bg-card/70" : "border-border/60 bg-card/40"
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="w-full text-left cursor-pointer px-4 py-3 font-medium text-foreground hover:bg-card/60 transition-colors flex items-center justify-between gap-3"
      >
        <span>{item.q}</span>
        <motion.svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 14 14"
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className={`shrink-0 transition-colors duration-300 ${open ? "text-primary" : "text-muted-foreground"}`}
        >
          <path d="M7 1 L7 13 M1 7 L13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.38, ease: EASE },
              opacity: { duration: 0.28, ease: "easeOut" },
            }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -6 }}
              animate={{ y: 0 }}
              exit={{ y: -6 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="px-4 pb-4 pt-3 text-muted-foreground text-sm md:text-base leading-relaxed border-t border-border/40"
            >
              {item.a}
              {item.link && (
                <>
                  {" "}
                  <Link href={item.link.href} className="text-primary hover:underline">
                    {item.link.label}
                  </Link>
                  .
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      className="border-t border-border/60 py-16 md:py-20 bg-muted/20"
      aria-label="FAQ"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-brand font-semibold text-2xl sm:text-3xl md:text-4xl tracking-[-0.02em] text-foreground">
            Frequently asked questions
          </h2>
          <ul className="mt-8 space-y-4">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem
                key={i}
                id={`faq-${i}`}
                item={item}
                open={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
