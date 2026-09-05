"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

const FAQ_ITEMS = [
  {
    q: "Are the monologues AI-written?",
    a: "No. Every piece is the original published text from a real play, film, or show. The AI only helps you find the right one, it never writes or rewrites a word of the monologue itself.",
  },
  {
    q: "How does the search actually work?",
    a: "You describe what you need the way you'd say it out loud, like \"angry woman in her twenties, under two minutes\" or \"something funny that isn't Shakespeare.\" It searches meaning, not keywords, across 19,000+ monologues from 1,700+ plays, films, and shows.",
  },
  {
    q: "Where do the monologues come from?",
    a: "Public domain plays, plus film and TV. Every piece links back to its source and original publication, and I don't host full scripts of copyrighted work. Full details: ",
    link: { href: "/sources", label: "Sources & copyright" },
  },
  {
    q: "Can other people see what I search for?",
    a: "Your searches are never shown to anyone, and the raw text you type is never even stored. The callboard can show that someone searched for a comedic monologue, never the words you used. Pieces you read, save, or rehearse do appear there with your first name and photo, and you can switch that off anytime with \"Hide my activity\" on the callboard. It hides everything you've already done too, not just what comes next.",
  },
  {
    q: "Will everyone in the room be doing the same piece?",
    a: "That's the real problem with monologue books. Every piece here is scored on how overdone it is, from fresh to warhorse, so you can see what you're walking in with before you commit to it.",
  },
  {
    q: "What is ScenePartner?",
    a: "An AI reader for your scenes. Upload a script, it pulls out the scenes and characters, and you run your lines with it out loud, voice to voice. It's for the nights you need to rehearse at 1am and nobody is around.",
  },
  {
    q: "Do I have to pay to try it?",
    a: "No. You can start free without a card and search right away. Plus is $12 a month or $99 a year if you want unlimited searches and more time with ScenePartner.",
  },
  {
    q: "How do I cancel?",
    a: "Anytime, from your billing page, in a couple of clicks. No commitment and no retention maze to click through.",
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
          <h2 className="font-brand font-semibold text-2xl sm:text-3xl md:text-4xl text-foreground">
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
