import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-8 py-6 flex items-center justify-end">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-8 py-40 min-h-[80vh] flex flex-col justify-center">
        <div className="max-w-6xl">
          <h1 className="text-[10rem] md:text-[14rem] font-bold mb-12 leading-none tracking-tighter">
            ACTORRISE
          </h1>
          <p className="text-4xl md:text-5xl text-muted-foreground font-mono font-light max-w-3xl mb-16">
            AI-powered tools for actors
          </p>
          <div className="flex gap-4 flex-wrap">
            <Button asChild size="lg" className="text-lg px-8 py-6">
              <Link href="/login">Get Started Free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-8 py-40">
        <h2 className="text-2xl font-mono text-muted-foreground mb-20">Tools built for working actors</h2>
        <div className="max-w-5xl space-y-16">
          <div className="space-y-4">
            <h3 className="text-5xl md:text-6xl font-bold font-mono">MonologueMatch</h3>
            <p className="text-xl text-muted-foreground font-mono max-w-2xl">
              Find your perfect monologue with AI-powered semantic search across thousands of classic plays
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-5xl md:text-6xl font-bold font-mono">ScenePartner</h3>
              <span className="text-sm font-mono text-muted-foreground bg-muted px-3 py-1 rounded-md">
                Coming Soon
              </span>
            </div>
            <p className="text-xl text-muted-foreground font-mono max-w-2xl">
              Practice scenes with an AI partner that adapts to your choices and keeps you sharp
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-5xl md:text-6xl font-bold font-mono">CraftCoach</h3>
              <span className="text-sm font-mono text-muted-foreground bg-muted px-3 py-1 rounded-md">
                Coming Soon
              </span>
            </div>
            <p className="text-xl text-muted-foreground font-mono max-w-2xl">
              Get personalized feedback on your technique and craft from an AI acting coach
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-5xl md:text-6xl font-bold font-mono">AuditionTracker</h3>
              <span className="text-sm font-mono text-muted-foreground bg-muted px-3 py-1 rounded-md">
                Coming Soon
              </span>
            </div>
            <p className="text-xl text-muted-foreground font-mono max-w-2xl">
              Organize auditions, track submissions, and stay on top of your career opportunities
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-8 py-40">
        <h2 className="text-2xl font-mono text-muted-foreground mb-20">Simple, transparent pricing</h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl items-stretch">
          {/* Free Tier */}
          <div className="flex flex-col space-y-6">
            <div>
              <h3 className="text-3xl font-bold mb-2">Free</h3>
              <p className="text-muted-foreground font-mono">Perfect for exploring</p>
            </div>
            <div>
              <div className="text-5xl font-bold">$0</div>
              <p className="text-muted-foreground font-mono text-sm mt-1">forever</p>
            </div>
            <ul className="space-y-3 text-sm font-mono flex-1">
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>10 AI searches/month</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>5 bookmarks</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Community support</span>
              </li>
            </ul>
            <Button asChild variant="outline" className="w-full mt-auto">
              <Link href="/login">Get Started</Link>
            </Button>
          </div>

          {/* Pro Tier */}
          <div className="flex flex-col space-y-6 relative">
            <div className="absolute -top-4 left-0 right-0 flex justify-center">
              <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-mono">
                Most Popular
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-bold mb-2">Pro</h3>
              <p className="text-muted-foreground font-mono">For working actors</p>
            </div>
            <div>
              <div className="text-5xl font-bold">$12</div>
              <p className="text-muted-foreground font-mono text-sm mt-1">per month</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">$99/year (save 31%)</p>
            </div>
            <ul className="space-y-3 text-sm font-mono flex-1">
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>150 AI searches/month</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Unlimited bookmarks</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Priority support</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Early access to new features</span>
              </li>
            </ul>
            <Button asChild className="w-full mt-auto">
              <Link href="/pricing">Subscribe</Link>
            </Button>
          </div>

          {/* Elite Tier */}
          <div className="flex flex-col space-y-6">
            <div>
              <h3 className="text-3xl font-bold mb-2">Elite</h3>
              <p className="text-muted-foreground font-mono">For professionals</p>
            </div>
            <div>
              <div className="text-5xl font-bold">$24</div>
              <p className="text-muted-foreground font-mono text-sm mt-1">per month</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">$199/year (save 31%)</p>
            </div>
            <ul className="space-y-3 text-sm font-mono flex-1">
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Unlimited AI searches</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Unlimited bookmarks</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>ScenePartner & CraftCoach</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>Advanced analytics</span>
              </li>
            </ul>
            <Button asChild variant="outline" className="w-full mt-auto">
              <Link href="/pricing">Subscribe</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20">
        <div className="container mx-auto px-8">
          <p className="text-sm text-muted-foreground">© 2026 ACTORRISE</p>
        </div>
      </footer>
    </div>
  );
}
