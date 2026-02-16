import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2.5 text-foreground hover:opacity-80 transition-opacity">
                <Image src="/logo.png" alt="ActorRise" width={32} height={32} className="rounded-md" />
                <span className="font-brand text-2xl font-semibold text-foreground">ActorRise</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-1">
              <Link
                href="#suite"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                Search
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="#how"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                How it works
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="#pricing"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
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
        <section className="container mx-auto px-4 sm:px-6 pt-24 pb-20 md:pt-36 md:pb-28">
          <div className="max-w-5xl">
            <h1 className="text-4xl sm:text-5xl md:text-7xl leading-[1.02] tracking-[-0.04em]">
              Find the monologue. In seconds.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              World&apos;s largest monologue database.
            </p>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
              <div className="space-y-1 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">8,600+</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  monologues
                </div>
              </div>
              <div className="space-y-1 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">AI search</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  type what you want
                </div>
              </div>
              <div className="space-y-1 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3">
                <div className="text-2xl">Save it</div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                  bookmark, take it with you
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="suite" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Search what you&apos;re looking for.
            </h2>
            <p className="mt-4 text-muted-foreground">
              One search box. No filters to learn. Understands what you mean, not just what you type.
            </p>
            <div className="mt-6">
              <Button asChild size="lg" className="px-8">
                <Link href="/signup">Start free</Link>
              </Button>
            </div>
            <p className="mt-8 text-sm text-muted-foreground">
              ScenePartner, CraftCoach & more coming soon.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-5xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Three steps.
            </h2>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-border p-8">
                <div className="text-base text-foreground/80">01</div>
                <h3 className="mt-3 text-2xl tracking-[-0.02em]">Search</h3>
                <p className="mt-3 text-foreground/85">
                  Describe what you need. Get a shortlist.
                </p>
              </div>
              <div className="rounded-xl border border-border p-8">
                <div className="text-base text-foreground/80">02</div>
                <h3 className="mt-3 text-2xl tracking-[-0.02em]">Save</h3>
                <p className="mt-3 text-foreground/85">
                  Bookmark what you like.
                </p>
              </div>
              <div className="rounded-xl border border-border p-8">
                <div className="text-base text-foreground/80">03</div>
                <h3 className="mt-3 text-2xl tracking-[-0.02em]">Rehearse</h3>
                <p className="mt-3 text-foreground/85">
                  Walk in ready.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Proof */}
        <section id="proof" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Get back to what matters: <span className="italic underline underline-offset-2 decoration-primary/60">performing.</span>
            </h2>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-4xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Simple pricing.
            </h2>
            <p className="mt-2 text-muted-foreground">
              Free tier to explore. Upgrade when you&apos;re ready.
            </p>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-border/60 bg-card/40 p-6 flex flex-col">
                <h3 className="text-xl font-semibold">Free</h3>
                <p className="mt-1 text-2xl font-bold">$0</p>
                <p className="mt-2 text-sm text-muted-foreground">10 AI searches, 5 bookmarks</p>
                <div className="mt-6 flex-1" />
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href="/signup">Get started</Link>
                </Button>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 p-6 flex flex-col">
                <h3 className="text-xl font-semibold">Plus</h3>
                <p className="mt-1 text-2xl font-bold">$12<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="mt-2 text-sm text-muted-foreground">150 searches, unlimited bookmarks</p>
                <div className="mt-6 flex-1" />
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href="/pricing">Subscribe</Link>
                </Button>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 p-6 flex flex-col">
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
        <div className="container mx-auto px-4 sm:px-6 py-10 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground/90 max-w-xl">
            Monologues from public domain and licensed sources (e.g.{" "}
            <Link href="/sources" className="underline hover:no-underline text-foreground/80">
              Project Gutenberg
            </Link>
            ). We do not distribute copyrighted play text.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ActorRise</p>
              <p className="text-xs text-muted-foreground/80">Built by an actor, for actors.</p>
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-4">
              <Link href="/sources" className="hover:text-foreground transition-colors">
                Sources & copyright
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/login" className="hover:text-foreground transition-colors">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
