import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconSearch, IconUser, IconSparkles, IconMicrophone } from "@tabler/icons-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b-4 border-border">
        <div className="container mx-auto px-6 py-6 flex items-center justify-between">
          <div className="text-3xl font-bold tracking-tight">ACTORRISE</div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-3xl">
          <h1 className="text-6xl font-bold mb-6 leading-tight">
            Your Complete Acting Platform
          </h1>
          <p className="text-xl mb-10 leading-relaxed">
            Everything you need to succeed as an actor. MonologueMatch, ScenePartner, CraftCoach, and more—all in one place.
          </p>
          <div className="flex gap-4">
            <Link href="/signup">
              <Button size="lg">Start Free Trial</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">Sign In</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-20">
        <h2 className="text-4xl font-bold mb-12">What You Get</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-8">
              <IconSearch className="h-10 w-10 mb-4" strokeWidth={2.5} />
              <h3 className="text-2xl font-bold mb-3">MonologueMatch</h3>
              <p className="text-base leading-relaxed">
                AI-powered monologue discovery tailored to your profile and preferences.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8">
              <IconUser className="h-10 w-10 mb-4" strokeWidth={2.5} />
              <h3 className="text-2xl font-bold mb-3">ScenePartner</h3>
              <p className="text-base leading-relaxed">
                AI scene partners for self-tape prep. Practice anytime, anywhere.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8">
              <IconSparkles className="h-10 w-10 mb-4" strokeWidth={2.5} />
              <h3 className="text-2xl font-bold mb-3">CraftCoach</h3>
              <p className="text-base leading-relaxed">
                Get AI feedback on your performances to improve your craft.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8">
              <IconMicrophone className="h-10 w-10 mb-4" strokeWidth={2.5} />
              <h3 className="text-2xl font-bold mb-3">AuditionTracker</h3>
              <p className="text-base leading-relaxed">
                Track submissions, callbacks, and bookings. Never miss an opportunity.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20">
        <Card>
          <CardContent className="p-16 text-center">
            <h2 className="text-4xl font-bold mb-6">Ready to Start?</h2>
            <p className="text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
              Join thousands of actors using ActorRise to find the perfect monologues, practice scenes, and track their careers.
            </p>
            <Link href="/signup">
              <Button size="lg">Get Started Free</Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t-4 border-border py-10">
        <div className="container mx-auto px-6 text-center">
          <p className="font-bold">© 2024 ACTORRISE</p>
        </div>
      </footer>
    </div>
  );
}
