import type { Monologue } from "@/types/actor";

export type SourceTagKind = "classical" | "contemporary" | "film" | "tv";

/**
 * Which shelf a piece came off.
 *
 * `source_type` wins because film and tv are facts about the medium; a screen
 * piece has no useful classical/contemporary reading. `category` only decides
 * between the two play shelves. Anything that answers neither gets no tag at
 * all rather than a guessed one — a wrong shelf is worse than a missing pill,
 * because the actor filters on exactly this.
 */
export function sourceTagOf(m: {
  source_type?: string | null;
  category?: string | null;
}): SourceTagKind | null {
  const src = (m.source_type ?? "").toLowerCase();
  if (src === "film" || src === "movie") return "film";
  if (src === "tv" || src === "television" || src === "tv_show") return "tv";

  const cat = (m.category ?? "").toLowerCase();
  if (cat === "classical") return "classical";
  if (cat === "contemporary") return "contemporary";
  return null;
}

/** The same derivation, for anything holding a full Monologue. */
export function sourceTagFor(m: Monologue): SourceTagKind | null {
  return sourceTagOf(m as { source_type?: string | null; category?: string | null });
}

export function SourceTag({
  kind,
  className = "",
}: {
  kind: SourceTagKind | null;
  className?: string;
}) {
  if (!kind) return null;
  return (
    <span className={`t-src t-src--${kind} ${className}`.trim()}>{kind}</span>
  );
}

/** Reads the tag straight off a piece; renders nothing when it cannot tell. */
export function MonologueSourceTag({
  monologue,
  className,
}: {
  monologue: { source_type?: string | null; category?: string | null };
  className?: string;
}) {
  return <SourceTag kind={sourceTagOf(monologue)} className={className} />;
}

/**
 * The key under the quick chips. Four pills is two more than anyone reads by
 * inference, so the page says what they mean once.
 */
export function SourceTagLegend({ className = "" }: { className?: string }) {
  return (
    <p className={`t-src-legend ${className}`.trim()}>
      (the shelves:){" "}
      <span style={{ color: "oklch(0.58 0.18 45)" }}>
        <b />
      </span>{" "}
      play · classical{" "}
      <span style={{ color: "oklch(0.58 0.18 45)" }}>
        <b style={{ background: "currentColor" }} />
      </span>{" "}
      play · contemporary{" "}
      <span style={{ color: "oklch(0.62 0.15 300)" }}>
        <b style={{ background: "currentColor", borderRadius: 2 }} />
      </span>{" "}
      film{" "}
      <span style={{ color: "oklch(0.62 0.15 300)" }}>
        <b style={{ borderRadius: 2 }} />
      </span>{" "}
      tv
    </p>
  );
}
