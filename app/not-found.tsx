import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NotFoundBear } from "@/components/system/NotFoundBear";
import { T } from "@/lib/i18n";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        {/* The catalogue maps state:404 to the bear, which is the joke worth
            making here: "Exit, pursued by a bear" is the most famous stage
            direction in English, and it is a direction about leaving in a
            hurry. It replaces the 6xl "404" rather than joining it — the house
            rule is one mark per view, and a number that large is a mark. */}
        <div className="flex justify-center text-muted-foreground/50">
          <NotFoundBear />
        </div>

        <p className="stage-direction text-sm text-muted-foreground/70">
          <T k="appShellErrors.bearDirection" />
        </p>
        <h1 className="font-brand text-3xl font-medium text-foreground sm:text-4xl">
          <T k="appShellErrors.leftStage" />
        </h1>
        <p className="text-muted-foreground">
          <T k="appShellErrors.leftStageBody" />
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          <Button asChild>
            <Link href="/monologues"><T k="appShellErrors.findMonologue" /></Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/"><T k="appShellErrors.goHome" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
