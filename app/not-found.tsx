import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/brand/glyphs";

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
          <Glyph name="bear" size={88} title="Exit, pursued by a bear" />
        </div>

        <p className="stage-direction text-sm text-muted-foreground/70">
          (exit, pursued by a bear.)
        </p>
        <h1 className="font-brand text-3xl font-medium text-foreground sm:text-4xl">
          This page has left the stage.
        </h1>
        <p className="text-muted-foreground">
          It doesn&rsquo;t exist, or it moved. Nothing you did.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          <Button asChild>
            <Link href="/monologues">Find a monologue</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
