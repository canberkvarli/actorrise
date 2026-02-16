/**
 * Value props (Speed, Odds, Scale). Editorial strip, no cards.
 * so it reads different from "Three steps."
 */

function SpeedBlock() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Speed
      </p>
      <p className="text-base text-foreground/90 leading-snug">
        Find the right audition monologue in <span className="font-semibold">less than 20 seconds.</span>
      </p>
    </div>
  );
}

function OddsBlock() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Odds
      </p>
      <p className="text-base text-foreground/90 leading-snug">
        <span className="font-semibold">4× bigger</span>
        <span className="text-muted-foreground mx-1">→</span>
        <span className="font-semibold">4× better chance</span>
        . Than other collections.
      </p>
    </div>
  );
}

function ScaleBlock() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Scale
      </p>
      <p className="text-base text-foreground/90 leading-snug">
        <span className="font-bold tabular-nums">8,600+</span>
        {" "}monologues. AI search, no keyword frustration.
      </p>
    </div>
  );
}

export function LandingValueProps() {
  return (
    <section
      className="border-t border-border/60 py-20 md:py-28"
      aria-label="Why ActorRise"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-start gap-10 md:gap-12 md:divide-x md:divide-border/60">
          <div className="md:flex-1 md:px-0 md:pr-12">
            <SpeedBlock />
          </div>
          <div className="md:flex-1 md:px-12">
            <OddsBlock />
          </div>
          <div className="md:flex-1 md:pl-12">
            <ScaleBlock />
          </div>
        </div>
      </div>
    </section>
  );
}
