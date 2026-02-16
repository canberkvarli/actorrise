/**
 * Value props (Speed, Odds, Scale). Editorial strip with light structure.
 */

const labelClass =
  "inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground";

function SpeedBlock() {
  return (
    <div className="flex flex-col gap-3 pl-5 md:pl-6 border-l-2 border-primary/25">
      <p className={labelClass}>
        <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
        Speed
      </p>
      <p className="text-lg text-foreground/95 leading-snug">
        Find the right audition monologue in{" "}
        <span className="font-semibold text-foreground">less than 20 seconds.</span>
      </p>
    </div>
  );
}

function OddsBlock() {
  return (
    <div className="flex flex-col gap-3 pl-5 md:pl-6 border-l-2 border-primary/25">
      <p className={labelClass}>
        <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
        Odds
      </p>
      <p className="text-lg text-foreground/95 leading-snug">
        <span className="font-semibold text-foreground">4× bigger → 4× better chance.</span>{" "}
        Than other collections.
      </p>
    </div>
  );
}

function ScaleBlock() {
  return (
    <div className="flex flex-col gap-3 pl-5 md:pl-6 border-l-2 border-primary/25">
      <p className={labelClass}>
        <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
        Scale
      </p>
      <p className="text-lg text-foreground/95 leading-snug">
        <span className="font-semibold tabular-nums text-foreground">8,600+</span> monologues. AI
        search, no keyword frustration.
      </p>
    </div>
  );
}

export function LandingValueProps() {
  return (
    <section
      className="border-t border-border/60 py-20 md:py-28 bg-muted/20"
      aria-label="Why ActorRise"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-start gap-12 md:gap-14">
          <div className="md:flex-1">
            <SpeedBlock />
          </div>
          <div className="md:flex-1">
            <OddsBlock />
          </div>
          <div className="md:flex-1">
            <ScaleBlock />
          </div>
        </div>
      </div>
    </section>
  );
}
