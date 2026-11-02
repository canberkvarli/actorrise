import Link from "next/link";
import { Button } from "@/components/ui/button";
import { T } from "@/lib/i18n";

/** 404 for platform routes (keeps nav/sidebar). */
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md space-y-4">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-foreground"><T k="appShellErrors.notFoundTitle" /></h2>
        <p className="text-muted-foreground">
          <T k="appShellErrors.notFoundBody" />
        </p>
        <div className="pt-4 flex flex-wrap gap-3 justify-center">
          <Button asChild>
            <Link href="/practice"><T k="appShellErrors.practice" /></Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/monologues"><T k="appShellErrors.browseMonologues" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
