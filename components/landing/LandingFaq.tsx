"use client";

import Link from "next/link";

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

export function LandingFaq() {
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
              <li key={i}>
                <details className="group rounded-lg border border-border/60 bg-card/40 overflow-hidden">
                  <summary className="list-none cursor-pointer px-4 py-3 font-medium text-foreground hover:bg-card/60 transition-colors flex items-center justify-between gap-2">
                    <span>{item.q}</span>
                    <span className="text-muted-foreground group-open:rotate-180 transition-transform shrink-0" aria-hidden>
                      ▼
                    </span>
                  </summary>
                  <div className="px-4 pb-4 pt-0 text-muted-foreground text-sm md:text-base leading-relaxed border-t border-border/40">
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
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
