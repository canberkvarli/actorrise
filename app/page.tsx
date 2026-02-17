import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingValueProps } from "@/components/landing/LandingValueProps";
import { LandingDemoSearch } from "@/components/landing/LandingDemoSearch";
import { LandingMobileNav } from "@/components/landing/LandingMobileNav";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";

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
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="/for-teachers"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                For teachers
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <ContactModalTrigger className="px-3 py-1.5 text-sm text-foreground/90">
                Contact
              </ContactModalTrigger>
            </div>
            <div className="flex items-center gap-2">
              <LandingMobileNav />
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
        {/* Hero: search bar as focal point — content top-aligned so title doesn't move when results appear */}
        <section id="suite" className="container mx-auto px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28 flex flex-col items-center">
          <div className="max-w-2xl w-full mx-auto text-center">
            <h1 className="text-5xl sm:text-6xl md:text-7xl leading-[1.02] tracking-[-0.04em]">
              Find the <span className="hero-keyword">monologue</span>. In seconds.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground">
              Get what you need in less than 20 seconds.
            </p>
            <div className="mt-8">
              <LandingDemoSearch />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-5xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Get back to what matters: <span className="italic underline underline-offset-2 decoration-primary/60">performing.</span>
            </h2>
            <p className="mt-2 text-muted-foreground text-lg">Three steps.</p>
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

        {/* Casting */}
        <section className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Give casting directors <span className="font-semibold text-primary">something different.</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              The Overdone filter helps you show up with pieces they haven’t seen a hundred times.
            </p>
          </div>
        </section>

        <LandingValueProps />

        {/* Pricing: benefits from API so visitors see what's included without leaving the page */}
        <LandingPricing />
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
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-4">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/sources" className="hover:text-foreground transition-colors">
                Sources & copyright
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/for-teachers" className="hover:text-foreground transition-colors">
                For teachers
              </Link>
              <ContactModalTrigger className="hover:text-foreground">
                Contact
              </ContactModalTrigger>
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
