import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

// Signup and login both take ?redirect=, so a writer lands on the form after.
const FORM = "/submit-monologue?as=playwright";
const SIGNUP = `/signup?redirect=${encodeURIComponent(FORM)}`;
const LOGIN = `/login?redirect=${encodeURIComponent(FORM)}`;

export const metadata: Metadata = {
  title: "For Playwrights: Put Your Monologues in Front of Actors",
  description:
    "Actors search ActorRise for audition monologues every day, teens most of all. Send me a monologue from your play and it shows up in search with your name and a link to get the play.",
  openGraph: {
    title: "For Playwrights | ActorRise",
    description:
      "Send me a monologue from your play. Actors find it in search with your name on it and a link to get the play. You can take it down any time.",
    url: `${siteUrl}/for-playwrights`,
  },
  alternates: { canonical: `${siteUrl}/for-playwrights` },
};

const STEPS = [
  "Make a free account, so I know who to write back to.",
  "Send me a monologue from your play, with a link to where actors can get the whole thing: your publisher's page or your own site.",
  "I read it myself. Once it's in, it shows up when an actor searches for what it is, with your name, the play and your link.",
];

const PROMISES = [
  "You choose what goes up. One speech at a time, never the play.",
  "Every piece carries your name, the play and your link, so the actor who wants more goes and gets it from you.",
  "Ask me to take something down and it's gone the same day. No questions.",
  "No fee, either way. I don't charge writers and I don't take a cut.",
];

export default function ForPlaywrightsPage() {
  return (
    <>
      <StageHero
        direction="(for playwrights)"
        title={
          <>
            Put your monologues in front of <em className="italic text-primary">actors</em> looking for them.
          </>
        }
        lede="Actors come to ActorRise to find audition pieces. What they ask for most, and what I have least of, is contemporary monologues from real plays. Teens most of all."
      />

      <div className="container mx-auto max-w-2xl px-6 py-12 md:py-16">
        <p className="mb-8 text-lg text-muted-foreground">
          I'm Canberk, an actor in Berkeley, and I built ActorRise because finding the right piece took me forever.
          If you write plays, your monologues are exactly what the actors here are searching for. Let them find you.
        </p>

        <h2 className="mb-3 text-lg font-semibold text-foreground">How it works</h2>
        <ol className="mb-10 list-decimal space-y-2 pl-5 text-muted-foreground">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <h2 className="mb-3 text-lg font-semibold text-foreground">What I promise</h2>
        <ul className="mb-10 space-y-2 text-muted-foreground">
          {PROMISES.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-primary">·</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>

        <p className="mb-8 text-muted-foreground">
          Rather send a batch, or talk first? Write to me at{" "}
          <a href="mailto:canberk@actorrise.com" className="font-medium text-foreground underline hover:no-underline">
            canberk@actorrise.com
          </a>
          .
        </p>

        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href={SIGNUP}>Send a monologue</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href={LOGIN}>I already have an account</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
