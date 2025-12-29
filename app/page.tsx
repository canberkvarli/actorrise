import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconSearch, IconUser, IconSparkles, IconMicrophone } from "@tabler/icons-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Navigation */}
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold" style={{ fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif" }}>ActorRise</div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Your Complete Acting Platform
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Everything you need to succeed as an actor. MonologueMatch, ScenePartner, CraftCoach, and more—all in one place.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/signup">
            <Button size="lg" className="text-lg px-8">
              Start Free Trial
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="text-lg px-8">
              Sign In
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Everything You Need</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-lg border bg-card">
            <IconSearch className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">MonologueMatch</h3>
            <p className="text-muted-foreground">
              AI-powered monologue discovery tailored to your profile and preferences.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <IconUser className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">ScenePartner</h3>
            <p className="text-muted-foreground">
              AI scene partners for self-tape prep. Practice anytime, anywhere.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <IconSparkles className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">CraftCoach</h3>
            <p className="text-muted-foreground">
              Get AI feedback on your performances to improve your craft.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <IconMicrophone className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">AuditionTracker</h3>
            <p className="text-muted-foreground">
              Track submissions, callbacks, and bookings. Never miss an opportunity.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-2xl mx-auto p-12 rounded-lg border bg-card">
          <h2 className="text-3xl font-bold mb-4">Ready to Elevate Your Acting Career?</h2>
          <p className="text-muted-foreground mb-8">
            Join thousands of actors using ActorRise to find the perfect monologues, practice scenes, and track their careers.
          </p>
          <Link href="/signup">
            <Button size="lg" className="text-lg px-8">
              Get Started Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 ActorRise. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
