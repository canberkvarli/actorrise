"use client";

import Image from "next/image";
import { IconArrowLeft } from "@tabler/icons-react";

import { Monologue } from "@/types/actor";
import { displayableAuthor } from "@/lib/utils";
import { posterAt, overdoneBand } from "@/lib/poster";
import { PlayCover, clothFor } from "@/components/monologue/PlayCover";
import { PieceWhisper } from "@/components/community/Whisper";
import { usePieceActivity } from "@/hooks/useCallboardPulse";

/**
 * The one-sheet.
 *
 * Dark in both themes — see `.t-m__sheet` in globals.css. A poster is a lit
 * object; it does not turn cream because the room did, and the class
 * redeclares its own ground tokens so the `.dark` flip on the page below
 * cannot reach in and paint its type ink-on-ink.
 *
 * The cover leans. A play has no photograph, so it gets a cover printed from
 * the row — cloth, emblem, title — and the lean plus the gel offset are what
 * stop that printed cover from reading as a placeholder where a real poster
 * failed to load.
 */

function clean(value?: string | null): string | null {
  const s = value?.trim();
  if (!s || s.toLowerCase() === "any" || s.toLowerCase() === "unknown") return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What an actor actually filters on, in the order they'd say it. */
function castingFacts(monologue: Monologue): string[] {
  const secs = monologue.estimated_duration_seconds;
  return [
    secs ? `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}` : null,
    clean(monologue.character_gender),
    monologue.character_age_range && monologue.character_age_range.toLowerCase() !== "any"
      ? monologue.character_age_range
      : null,
    clean(monologue.tone),
    clean(monologue.primary_emotion),
  ].filter((x): x is string => Boolean(x));
}

/** The overdone ticks, over the sheet's fixed dark ground. */
function OverdoneTicks({ score }: { score: number | null | undefined }) {
  const band = overdoneBand(score);
  if (!band) return null;
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden style={{ color: "var(--t-faint-2)" }}>·</span>
      <span
        title={
          band.level >= 2
            ? "You will not be the only one bringing this today."
            : "How often a casting room hears this piece."
        }
        className="t-m__mono inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em]"
        style={{
          color: band.level >= 2 ? "var(--t-gel)" : "var(--t-muted-dark)",
        }}
      >
        <span aria-hidden className="inline-flex gap-[2px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-2.5 w-[3px] bg-current"
              style={{ opacity: i <= band.level ? 1 : 0.25 }}
            />
          ))}
        </span>
        {band.label}
      </span>
    </span>
  );
}

export function OneSheet({
  monologue,
  inLane,
  laneReason,
  onBack,
}: {
  monologue: Monologue;
  /** The recommender's fit for this actor — see lib/profileMatch. */
  inLane?: boolean;
  laneReason?: string;
  onBack: () => void;
}) {
  const author = displayableAuthor(monologue.author);
  const facts = castingFacts(monologue);
  const poster = posterAt(monologue.poster_url, 600);
  const cloth = clothFor(monologue.play_title || monologue.character_name || "");
  const era = clean(monologue.category);

  // The billing line. A play bills its playwright where a film bills its
  // director, so neither is left with an empty credit.
  const billing = [
    poster ? monologue.director || author : author,
    monologue.year ? String(monologue.year) : null,
    monologue.imdb_rating ? `★ ${monologue.imdb_rating.toFixed(1)}` : null,
  ].filter((x): x is string => Boolean(x));

  return (
    /* isolation:isolate is load-bearing. Both wash layers sit at z-index -1 so
       they paint behind the content without needing a stacking hack on every
       child — but without a stacking context of their own, -1 puts them behind
       this element's own background and they vanish entirely. That has now
       been the cause of three separate "renders invisible while reporting the
       right colour" bugs in this codebase. */
    <section className="t-m__sheet relative isolate -mt-px overflow-hidden px-5 pb-16 pt-6 sm:px-8 sm:pb-20">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(120% 90% at 22% 0%, ${cloth.bg}, transparent 70%)`,
        }}
      />
      <div aria-hidden className="t-m__grain pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto max-w-[1000px]">
        <button
          type="button"
          onClick={onBack}
          className="t-m__dir t-m-rise inline-flex items-center gap-2 text-[13px] transition-colors"
          style={{ color: "var(--t-muted-light)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-gel)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-muted-light)")}
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          (back to the results.)
        </button>

        <div className="t-m-rise mt-7 flex items-end gap-[clamp(20px,4vw,40px)]">
          {/* The cover */}
          <div
            aria-hidden
            className="t-m__cover t-m-wobble w-[clamp(120px,22vw,190px)] shrink-0 overflow-hidden rounded-[4px]"
          >
            {poster ? (
              <div className="relative aspect-[2/3]">
                <Image
                  src={poster}
                  alt=""
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 22vw, 190px"
                  className="object-cover"
                  priority
                />
              </div>
            ) : (
              <PlayCover
                title={monologue.play_title}
                author={author}
                year={monologue.year}
                genre={monologue.genre}
                category={monologue.category}
                themes={monologue.themes}
              />
            )}
          </div>

          {/* The billing block */}
          <div className="min-w-0 flex-1 pb-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {era && (
                <span
                  className="t-m__mono whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-[3px] text-[11px] tracking-[0.08em]"
                  style={{ borderColor: "var(--t-orange)", color: "var(--t-orange-glow)" }}
                >
                  {era.toLowerCase()}
                </span>
              )}
              {inLane && (
                <span
                  title={laneReason ?? "Matches your type"}
                  className="t-m__mono whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] uppercase tracking-[0.12em]"
                  style={{ background: "var(--t-gel)", color: "var(--t-ink)" }}
                >
                  your lane
                </span>
              )}
              <span
                className="t-m__dir text-[13px]"
                style={{ color: "var(--t-faint)" }}
              >
                from {monologue.play_title}
              </span>
            </div>

            <h1
              className="t-m__display mt-3 text-[clamp(2.75rem,9vw,7rem)] leading-[0.9]"
              style={{ color: "var(--t-text)" }}
            >
              {monologue.character_name}
            </h1>

            {billing.length > 0 && (
              <p
                className="t-m__mono mt-3.5 text-[15px] leading-relaxed"
                style={{ color: "var(--t-muted-dark)" }}
              >
                {billing.map((b, i) => (
                  <span key={b}>
                    {i > 0 && <span style={{ color: "var(--t-faint-2)" }}> · </span>}
                    {b}
                  </span>
                ))}
              </p>
            )}

            {/* Facts go under the whole block on a phone rather than into the
                ~150px column beside the cover, where five of them wrap to four
                lines and push the cover taller than the screen. */}
            <div
              className="mt-3.5 hidden flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] sm:flex"
              style={{ color: "var(--t-muted-light-2)" }}
            >
              {facts.map((f, i) => (
                <span key={f} className="inline-flex items-center gap-2.5">
                  {i > 0 && <span style={{ color: "var(--t-faint-2)" }}>·</span>}
                  {f}
                </span>
              ))}
              <OverdoneTicks score={monologue.overdone_score} />
            </div>

            {monologue.scene_description && (
              <p
                className="t-m__dir mt-[18px] hidden max-w-[56ch] border-l-2 pl-3 text-[13px] not-italic leading-[1.7] sm:block"
                style={{
                  borderColor: "color-mix(in oklab, var(--t-gel) 60%, transparent)",
                  color: "var(--t-muted-dark-2)",
                  fontStyle: "italic",
                }}
              >
                {monologue.scene_description}
              </p>
            )}

            <PieceActivityLine monologueId={monologue.id} />
          </div>
        </div>

        <div
          className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] sm:hidden"
          style={{ color: "var(--t-muted-light-2)" }}
        >
          {facts.map((f, i) => (
            <span key={f} className="inline-flex items-center gap-2.5">
              {i > 0 && <span style={{ color: "var(--t-faint-2)" }}>·</span>}
              {f}
            </span>
          ))}
          <OverdoneTicks score={monologue.overdone_score} />
        </div>

        {monologue.scene_description && (
          <p
            className="t-m__dir mt-4 max-w-[56ch] border-l-2 pl-3 text-[13px] leading-[1.7] sm:hidden"
            style={{
              borderColor: "color-mix(in oklab, var(--t-gel) 60%, transparent)",
              color: "var(--t-muted-dark-2)",
            }}
          >
            {monologue.scene_description}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Recent activity on this piece. Split out so the hook sits behind the null
 * check: most pieces have no recent activity, and that should cost them an
 * early return rather than a subscription.
 */
function PieceActivityLine({ monologueId }: { monologueId: number }) {
  const activity = usePieceActivity(monologueId);
  if (!activity) return null;
  return (
    <div className="mt-3.5">
      <PieceWhisper latest={activity.latest} others={activity.others} tone="dark" />
    </div>
  );
}
