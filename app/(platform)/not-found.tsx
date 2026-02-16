import Link from "next/link";
import { Button } from "@/components/ui/button";

/** 404 for platform routes (keeps nav/sidebar). */
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md space-y-4">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-foreground">Page not found</h2>
        <p className="text-muted-foreground">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
        <div className="pt-4 flex flex-wrap gap-3 justify-center">
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/search">Search monologues</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
