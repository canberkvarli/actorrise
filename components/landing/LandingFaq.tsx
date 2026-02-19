"use client";

import Link from "next/link";

const FAQ_ITEMS = [
  {
    q: "Is the search really AI?",
    a: "Yes. ActorRise uses semantic (AI) search over 8,600+ real theatrical monologues and 14,000+ film/TV references. You describe what you need in plain English; we don't generate or invent text. We find the right published pieces.",
  },
  {
    q: "Where do the monologues come from?",
    a: "From public domain and licensed sources (e.g. Project Gutenberg and similar). We don't distribute copyrighted play text. Full details: ",
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

export function LandingFaq() {
  return (
    <section
      className="border-t border-border/60 py-16 md:py-20 bg-muted/20"
      aria-label="FAQ"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
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
