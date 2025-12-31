import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="container mx-auto px-8 py-6 flex items-center justify-end">
          <Link href="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-8 py-40 min-h-[80vh] flex flex-col justify-center">
        <div className="max-w-6xl">
          <h1 className="text-[10rem] md:text-[14rem] font-bold mb-12 leading-none tracking-tighter">
            ACTORRISE
          </h1>
          <p className="text-4xl md:text-5xl text-muted-foreground font-mono font-light max-w-3xl">
            AI-powered tools for actors
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-8 py-40 border-t border-border">
        <div className="max-w-4xl space-y-8">
          <h3 className="text-5xl md:text-6xl font-bold font-mono">MonologueMatch</h3>
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-5xl md:text-6xl font-bold font-mono">ScenePartner</h3>
            <span className="text-sm font-mono text-muted-foreground border border-border px-3 py-1 rounded-md">
              Coming Soon
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-5xl md:text-6xl font-bold font-mono">CraftCoach</h3>
            <span className="text-sm font-mono text-muted-foreground border border-border px-3 py-1 rounded-md">
              Coming Soon
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-5xl md:text-6xl font-bold font-mono">AuditionTracker</h3>
            <span className="text-sm font-mono text-muted-foreground border border-border px-3 py-1 rounded-md">
              Coming Soon
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-20">
        <div className="container mx-auto px-8">
          <p className="text-sm text-muted-foreground">© 2026 ACTORRISE</p>
        </div>
      </footer>
    </div>
  );
}
