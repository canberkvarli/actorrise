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
                Search
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
                href="#pricing"
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
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
              8,600+ monologues. AI search.
            </p>
            <h1 className="mt-5 text-5xl md:text-7xl leading-[1.02] tracking-[-0.04em]">
              Find the monologue. In seconds.
            </h1>
            <div className="mt-12 grid grid-cols-3 gap-4 max-w-2xl">
              <div className="space-y-1 rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">8,600+</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  monologues
                </div>
              </div>
              <div className="space-y-1 rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">AI search</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  type what you want
                </div>
              </div>
              <div className="space-y-1 rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">Save it</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  bookmark, take it with you
                </div>
              </div>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="px-8">
                <Link href="/signup">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-8">
                <Link href="/search">Explore search</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="suite" className="container mx-auto px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Search what you&apos;re looking for.
            </h2>
            <p className="mt-4 text-muted-foreground">
              One search box. No filters to learn. Find the right piece from 8,600+ monologues.
            </p>
            <p className="mt-8 text-sm text-muted-foreground">
              ScenePartner, CraftCoach & more coming soon.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="container mx-auto px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-5xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Three steps.
            </h2>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-border/60 p-8">
                <div className="text-sm text-muted-foreground">01</div>
                <h3 className="mt-3 text-xl tracking-[-0.02em]">Search</h3>
                <p className="mt-3 text-muted-foreground">
                  Describe what you need. Get a shortlist.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 p-8">
                <div className="text-sm text-muted-foreground">02</div>
                <h3 className="mt-3 text-xl tracking-[-0.02em]">Save</h3>
                <p className="mt-3 text-muted-foreground">
                  Bookmark what you like.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 p-8">
                <div className="text-sm text-muted-foreground">03</div>
                <h3 className="mt-3 text-xl tracking-[-0.02em]">Rehearse</h3>
                <p className="mt-3 text-muted-foreground">
                  Walk in ready.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Proof */}
        <section id="proof" className="container mx-auto px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Less searching. More doing.
            </h2>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="container mx-auto px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-4xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Start free.
            </h2>
            <p className="mt-2 text-muted-foreground">
              Free tier to explore. Upgrade when you&apos;re ready.
            </p>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-border/60 bg-card/40 p-6 flex flex-col">
                <h3 className="text-xl font-semibold">Free</h3>
                <p className="mt-1 text-2xl font-bold">$0</p>
                <p className="mt-2 text-sm text-muted-foreground">10 AI searches, 5 bookmarks</p>
                <div className="mt-6 flex-1" />
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href="/signup">Get started</Link>
                </Button>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/40 p-6 flex flex-col">
                <h3 className="text-xl font-semibold">Plus</h3>
                <p className="mt-1 text-2xl font-bold">$12<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="mt-2 text-sm text-muted-foreground">150 searches, unlimited bookmarks</p>
                <div className="mt-6 flex-1" />
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href="/pricing">Subscribe</Link>
                </Button>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/40 p-6 flex flex-col">
                <h3 className="text-xl font-semibold">Unlimited</h3>
                <p className="mt-1 text-2xl font-bold">$24<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="mt-2 text-sm text-muted-foreground">Unlimited searches + more</p>
                <div className="mt-6 flex-1" />
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href="/pricing">See plans</Link>
                </Button>
              </div>
            </div>
            <p className="mt-6 text-center">
              <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                See all plans & features →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="container mx-auto px-6 py-10 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ActorRise</p>
          <div className="text-sm text-muted-foreground flex items-center gap-4">
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
