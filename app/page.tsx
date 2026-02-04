import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-sm tracking-[0.24em] text-foreground/80 hover:text-foreground transition-colors"
              >
                ACTORRISE
              </Link>
              <span className="hidden sm:inline-flex items-center rounded-full border border-border/70 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/90">
                For working actors
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-1">
              <Link
                href="#suite"
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Tools
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="#how"
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                How it works
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="#proof"
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                In practice
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full px-5">
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="container mx-auto px-6 pt-24 pb-20 md:pt-36 md:pb-28">
          <div className="max-w-5xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-secondary-foreground/90">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Built for actors who take craft seriously
            </p>
            <h1 className="mt-5 text-5xl md:text-7xl leading-[1.02] tracking-[-0.04em]">
              Find material. Rehearse better. Walk in ready.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl">
              ActorRise is a focused suite of AI tools designed to help you discover audition-ready
              monologues, practice scenes, and build repeatable rehearsal habits.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="px-8">
                <Link href="/signup">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-8">
                <Link href="/search">Explore the search</Link>
              </Button>
              {/* Pricing intentionally hidden for now */}
              {/* <Button asChild size="lg" variant="ghost" className="px-8">
                <Link href="/pricing">Pricing</Link>
              </Button> */}
            </div>
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-3xl">
              <div className="space-y-1 rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">Thousands</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  searchable play texts
                </div>
              </div>
              <div className="space-y-1 rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">Faster</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  shortlists in minutes
                </div>
              </div>
              <div className="space-y-1 rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">Personal</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  notes + bookmarks
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="suite" className="container mx-auto px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-6xl">
            <div className="flex items-end justify-between gap-8 flex-wrap">
              <div>
                <p className="text-sm tracking-[0.25em] text-muted-foreground">THE SUITE</p>
                <h2 className="mt-4 text-3xl md:text-4xl tracking-[-0.03em]">
                  Simple tools that compound.
                </h2>
              </div>
              <p className="text-muted-foreground max-w-xl">
                Keep everything you need in one place—from discovery to rehearsal—without the noise.
              </p>
            </div>

            <div className="mt-12 grid md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-border/60 bg-card/40 p-8">
                <p className="inline-flex items-center rounded-full bg-secondary/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-secondary-foreground/90">
                  MONOLOGUEMATCH
                </p>
                <h3 className="mt-4 text-2xl md:text-3xl tracking-[-0.03em]">
                  Search with intent, not keywords.
                </h3>
                <p className="mt-4 text-muted-foreground">
                  Semantic search across plays to find pieces that fit your voice, type, and the room.
                </p>
                <div className="mt-6">
                  <Button asChild variant="outline">
                    <Link href="/search">Try search</Link>
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/40 p-8">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    SCENEPARTNER
                  </p>
                  <span className="text-[11px] text-secondary-foreground/90 bg-secondary/10 border border-secondary/40 rounded-full px-3 py-1">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-4 text-2xl md:text-3xl tracking-[-0.03em]">
                  Rehearse scenes on demand.
                </h3>
                <p className="mt-4 text-muted-foreground">
                  A responsive partner to keep your listening alive and your choices specific.
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/40 p-8">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    CRAFTCOACH
                  </p>
                  <span className="text-[11px] text-secondary-foreground/90 bg-secondary/10 border border-secondary/40 rounded-full px-3 py-1">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-4 text-2xl md:text-3xl tracking-[-0.03em]">
                  Feedback that’s actually useful.
                </h3>
                <p className="mt-4 text-muted-foreground">
                  Get clear rehearsal notes—objective, stakes, tactics, and the moments that turn.
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/40 p-8">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    AUDITIONTRACKER
                  </p>
                  <span className="text-[11px] text-secondary-foreground/90 bg-secondary/10 border border-secondary/40 rounded-full px-3 py-1">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-4 text-2xl md:text-3xl tracking-[-0.03em]">
                  Stay consistent. Stay ready.
                </h3>
                <p className="mt-4 text-muted-foreground">
                  Track submissions and what you’re preparing—so progress doesn’t reset between rooms.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="container mx-auto px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-5xl">
            <p className="text-sm tracking-[0.25em] text-muted-foreground">HOW IT WORKS</p>
            <h2 className="mt-4 text-3xl md:text-4xl tracking-[-0.03em]">
              A cleaner workflow in three steps.
            </h2>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-border/60 p-8">
                <div className="text-sm text-muted-foreground">01</div>
                <h3 className="mt-3 text-xl tracking-[-0.02em]">Search</h3>
                <p className="mt-3 text-muted-foreground">
                  Describe what you need—tone, situation, character engine—and get a shortlist.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 p-8">
                <div className="text-sm text-muted-foreground">02</div>
                <h3 className="mt-3 text-xl tracking-[-0.02em]">Save</h3>
                <p className="mt-3 text-muted-foreground">
                  Bookmark and organize pieces you’re actually excited to work on.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 p-8">
                <div className="text-sm text-muted-foreground">03</div>
                <h3 className="mt-3 text-xl tracking-[-0.02em]">Rehearse</h3>
                <p className="mt-3 text-muted-foreground">
                  Turn the shortlist into material you can walk in and play—fast.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Proof */}
        <section id="proof" className="container mx-auto px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-6xl">
            <p className="text-sm tracking-[0.25em] text-muted-foreground">IN PRACTICE</p>
            <h2 className="mt-4 text-3xl md:text-4xl tracking-[-0.03em]">
              Less searching. More doing.
            </h2>
            <div className="mt-12 grid lg:grid-cols-3 gap-6">
              <blockquote className="rounded-2xl border border-border/60 bg-card/40 p-8">
                <p className="text-lg leading-relaxed">
                  “I got a shortlist in minutes that actually matched the room. No doomscrolling.”
                </p>
                <footer className="mt-6 text-sm text-muted-foreground">Working actor</footer>
              </blockquote>
              <blockquote className="rounded-2xl border border-border/60 bg-card/40 p-8">
                <p className="text-lg leading-relaxed">
                  “It’s the first time the tool felt like it understood what I meant—not what I typed.”
                </p>
                <footer className="mt-6 text-sm text-muted-foreground">Student</footer>
              </blockquote>
              <blockquote className="rounded-2xl border border-border/60 bg-card/40 p-8">
                <p className="text-lg leading-relaxed">
                  “Clean, focused, and actually usable. The design makes me want to rehearse.”
                </p>
                <footer className="mt-6 text-sm text-muted-foreground">Coach</footer>
              </blockquote>
            </div>
            <div className="mt-10">
              <Button asChild size="lg" className="px-8">
                <Link href="/signup">Create your account</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="container mx-auto px-6 py-10 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ActorRise</p>
          <div className="text-sm text-muted-foreground flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
