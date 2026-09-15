"use client";

import { Monologue } from "@/types/actor";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueTextRenderer } from "@/components/monologue/MonologueTextRenderer";
import { GhostLightSketch } from "@/components/brand/sketches";
import { isBibliographicText, stageDirectionPercentage } from "@/lib/monologueText";
import { ReadGate } from "@/components/monologue/v2/ReadGate";

/**
 * Read mode: the piece as written, at a size you choose.
 *
 * The sizer is not a preference panel — it is the one accommodation a reading
 * surface owes anyone. "Bigger, for the wings" is the real use: an actor
 * holding a phone at arm's length in a corridor before they go in.
 */

export const TEXT_SIZES = [
  { px: "15px", title: "smaller", chip: "11px" },
  { px: "17px", title: "default", chip: "13px" },
  { px: "20px", title: "bigger, for the wings", chip: "15px" },
] as const;

export function TextSizer({
  size,
  onChange,
}: {
  size: number;
  onChange: (size: number) => void;
}) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-full border-[1.5px] p-[3px]"
      style={{ borderColor: "var(--t-line-light)", background: "var(--t-paper)" }}
    >
      {TEXT_SIZES.map((s, i) => (
        <button
          key={s.title}
          type="button"
          onClick={() => onChange(i)}
          aria-pressed={size === i}
          title={s.title}
          aria-label={`Text size: ${s.title}`}
          className="t-m__mono h-7 rounded-full px-2.5 transition-colors"
          style={{
            fontSize: s.chip,
            background: size === i ? "var(--t-text)" : "transparent",
            color: size === i ? "var(--t-on-text)" : "var(--t-muted-dark-2)",
          }}
        >
          A
        </button>
      ))}
    </div>
  );
}

export function ReadView({
  monologue,
  size,
  onSizeChange,
  textSlot,
}: {
  monologue: Monologue;
  size: number;
  onSizeChange: (size: number) => void;
  /** The annotatable reader, when the actor has somewhere to put a note. */
  textSlot?: React.ReactNode;
}) {
  if (isBibliographicText(monologue.text)) {
    return (
      <div
        className="rounded-lg border p-4 text-sm"
        style={{
          borderColor: "var(--t-line-light)",
          background: "var(--t-paper-2)",
          color: "var(--t-muted-dark)",
        }}
      >
        <p className="mb-1 font-medium" style={{ color: "var(--t-text)" }}>
          Text not available
        </p>
        <p>This entry appears to contain catalog data rather than the monologue itself.</p>
        {monologue.source_url && (
          <a
            href={monologue.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex text-xs underline underline-offset-4"
            style={{ color: "var(--t-orange-deep)" }}
          >
            View source
          </a>
        )}
      </div>
    );
  }

  const direction = monologue.stage_directions?.trim();

  return (
    <div className="t-m-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Styled like a stage direction but deliberately NOT .stage-direction:
            that class lower-cases its contents, which mangles a proper noun
            the moment a direction contains one. */}
        <p
          className="t-m__dir m-0 max-w-[48ch] text-[13px]"
          style={{ color: "var(--t-muted-dark-2)" }}
        >
          {direction
            ? direction.startsWith("(")
              ? direction
              : `(${direction})`
            : stageDirectionPercentage(monologue.text) > 50
              ? "(stage directions are dimmed; the spoken lines are in normal text.)"
              : ""}
        </p>
        <TextSizer size={size} onChange={onSizeChange} />
      </div>

      {/* The gate is positioned against this box, so it can lie over the last
          of the text rather than under all of it. */}
      <div className="relative mt-[22px]">
        <div
          className="t-m__mono max-w-[62ch] leading-[1.9] transition-[font-size] duration-300"
          style={{
            fontSize: TEXT_SIZES[size].px,
            color: "var(--t-text-soft)",
          }}
        >
          {textSlot ??
            (monologue.text_segments && monologue.text_segments.length > 0 ? (
              <MonologueTextRenderer
                text={monologue.text}
                segments={monologue.text_segments}
              />
            ) : (
              <MonologueText text={monologue.text} />
            ))}
        </div>

        {monologue.paywalled && <ReadGate />}
      </div>

      {/* A piece should finish somewhere, not just stop. Nothing to finish
          when the text was cut off by the gate instead. */}
      {!monologue.paywalled && (
        <div className="mt-2 flex justify-center">
          <GhostLightSketch size={34} delay={0.2} className="opacity-30" />
        </div>
      )}
    </div>
  );
}
