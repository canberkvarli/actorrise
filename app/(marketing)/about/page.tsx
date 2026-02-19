import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who we are. ActorRise was built by Canberk Varli, an actor and software engineer, to give actors more time for the work that matters.",
  openGraph: {
    title: "About | ActorRise",
    description: "Built by an actor who believes technology should support the art, not get in the way of it.",
  },
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2 font-brand">
        About ActorRise
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Who we are
      </p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-muted-foreground">
        <p className="text-base md:text-lg leading-relaxed">
          I&apos;m Canberk. I act with Inferno Theater in Berkeley and I built ActorRise because I
          kept losing entire days to finding audition monologues instead of actually rehearsing them.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          The math didn&apos;t make sense: 6 hours searching through plays, 2 hours rehearsing.
          That&apos;s backwards.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          Backstage had 1,100 pieces. Other platforms weren&apos;t much better. The search tools made
          me feel like I was fighting the technology instead of it helping me.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          So I built ActorRise: AI search across 8,600+ theatrical monologues and 14,000+ film/TV
          references. You describe what you need in plain English, it finds the right piece in 20
          seconds, and you get back to the actual work: rehearsing, acting, getting ready.
        </p>
        <p className="text-base md:text-lg leading-relaxed font-medium text-foreground">
          The goal isn&apos;t to replace the art. It&apos;s to give you more time for it.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          I&apos;m a software engineer and an actor, so I understand both sides. AI shouldn&apos;t take
          away from the craft. It should handle the tedious parts so actors can focus on what
          matters: the performance.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          Currently shipping features based on what actors tell me they need. Next up: ScenePartner
          AI for rehearsing scenes before auditions, and Audition Mode for practicing with feedback.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          Built by an actor who believes technology should support the art, not get in the way of it.
        </p>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/sources" className="text-primary hover:underline">
          Sources & copyright
        </Link>
        {" · "}
        <Link href="/contact" className="text-primary hover:underline">
          Contact
        </Link>
      </p>
    </div>
  );
}
