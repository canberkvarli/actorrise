"use client";

import Link from "next/link";

import { Monologue } from "@/types/actor";
import { displayableAuthor } from "@/lib/utils";
import { formatClock } from "@/lib/estimateDuration";
import { clothFor, emblemFor } from "@/components/monologue/PlayCover";
import { Glyph } from "@/components/brand/glyphs";
import { useOthersFromPlay, useSimilarPieces } from "@/hooks/useRelatedPieces";

/**
 * What to read next, in the two shapes an actor actually asks for it.
 *
 * "Others from the play" is a list, because the pieces share a cover and
 * printing four identical spines beside four names would be noise. "Same
 * register" is cards, because those pieces come from four different plays and
 * the cover is the fastest way to tell them apart.
 */

function firstLine(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).replace(/[\s,;:.]+\S*$/, "")}…`;
}

function ShelfHeading({
  children,
  accent,
  trailing,
}: {
  children: React.ReactNode;
  accent: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <h2
        className="t-m__display m-0 text-[clamp(1.6rem,4vw,2rem)] leading-[1.1]"
        style={{ textWrap: "balance" }}
      >
        {children}{" "}
        <em className="italic" style={{ color: "var(--t-orange-deep)" }}>
          {accent}
        </em>
      </h2>
      {trailing}
    </div>
  );
}

export function OthersFromPlay({ monologue }: { monologue: Monologue }) {
  const { data } = useOthersFromPlay(monologue.id);
  if (!data || data.length === 0) return null;

  return (
    <section className="mt-[72px]">
      <ShelfHeading accent={`${monologue.play_title}.`}>Others from</ShelfHeading>
      <div
        className="mt-[18px] border-t"
        style={{ borderColor: "var(--t-line-light)" }}
      >
        {data.map((m) => (
          <Link
            key={m.id}
            href={`/monologue/${m.id}`}
            className="flex items-center justify-between gap-4 border-b px-1 py-3.5 transition-transform duration-300 hover:translate-x-1.5"
            style={{ borderColor: "var(--t-line-light)" }}
          >
            <span className="min-w-0">
              <span className="t-m__mono block text-[17px] font-bold leading-[1.2]">
                {m.character_name}
              </span>
              <span
                className="t-m__display block truncate italic"
                style={{ color: "var(--t-muted-dark)", fontSize: 16, marginTop: 3 }}
              >
                &ldquo;{firstLine(m.text)}&rdquo;
              </span>
            </span>
            <span
              className="flex-shrink-0 text-[12px] font-semibold tabular-nums"
              style={{ color: "var(--t-muted-dark-2)" }}
            >
              {m.estimated_duration_seconds
                ? formatClock(m.estimated_duration_seconds)
                : `${m.word_count} words`}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SameRegister({ monologue }: { monologue: Monologue }) {
  const { data } = useSimilarPieces(monologue.id);
  if (!data || data.length === 0) return null;

  // What these actually have in common, said in the piece's own vocabulary
  // rather than asserted. Only the facts this row really carries.
  const register = [
    monologue.tone || monologue.primary_emotion,
    monologue.character_gender && monologue.character_gender.toLowerCase() !== "any"
      ? `${monologue.character_gender.toLowerCase()}'s roles`
      : null,
    monologue.category,
  ]
    .filter(Boolean)
    .join(" · ")
    .toLowerCase();

  return (
    <section className="mt-16">
      <ShelfHeading accent="register.">Same</ShelfHeading>
      {register && (
        <p
          className="t-m__dir mt-1.5 text-[12px]"
          style={{ color: "var(--t-faint)" }}
        >
          ({register}.)
        </p>
      )}
      <div className="mt-[18px] grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((m) => {
          const author = displayableAuthor(m.author);
          const cloth = clothFor(m.play_title || m.character_name || "");
          return (
            <Link
              key={m.id}
              href={`/monologue/${m.id}`}
              className="flex items-center gap-3.5 rounded-2xl border-[1.5px] p-3.5 transition-all duration-300 hover:-translate-y-1 hover:-rotate-[0.6deg]"
              style={{
                borderColor: "var(--t-line-light)",
                background: "var(--t-paper)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "var(--t-text)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--t-line-light)")
              }
            >
              <span
                aria-hidden
                className="flex h-[50px] w-[34px] flex-shrink-0 items-center justify-center rounded-[3px]"
                style={{
                  background: cloth.bg,
                  boxShadow: "2px 2px 0 var(--t-hard-shadow)",
                  color: "var(--t-cream)",
                }}
              >
                <Glyph
                  name={emblemFor({
                    genre: m.genre,
                    category: m.category,
                    themes: m.themes,
                    title: m.play_title,
                    author,
                  })}
                  size={18}
                />
              </span>
              <span className="min-w-0">
                <span className="t-m__mono block text-[15px] font-bold leading-[1.2]">
                  {m.character_name}
                </span>
                <span
                  className="t-m__mono block truncate text-[12px]"
                  style={{ color: "var(--t-muted-dark-2)", marginTop: 2 }}
                >
                  {[m.play_title, author].filter(Boolean).join(" · ")}
                </span>
                <span
                  className="block text-[12px]"
                  style={{ color: "var(--t-faint)", marginTop: 6 }}
                >
                  {[
                    m.estimated_duration_seconds
                      ? formatClock(m.estimated_duration_seconds)
                      : null,
                    m.tone || m.primary_emotion,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
