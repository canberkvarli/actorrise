"use client";

import { IconExternalLink, IconEdit } from "@tabler/icons-react";
import Image from "next/image";
import { Monologue } from "@/types/actor";
import { isMeaningfulMonologueTitle, displayableAuthor } from "@/lib/utils";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueTextRenderer } from "@/components/monologue/MonologueTextRenderer";
import { GhostLightSketch } from "@/components/brand/sketches";
import { isBibliographicText, stageDirectionPercentage } from "@/lib/monologueText";

export interface MonologueDetailContentProps {
  monologue: Monologue;
  /** Optional actions to render in the header row (e.g. "Rehearse" / favorite) */
  headerActions?: React.ReactNode;
  /** When provided (e.g. for moderators), show an Edit link in the footer */
  onEdit?: (monologueId: number) => void;
}

function clean(value?: string | null): string | null {
  const s = value?.trim();
  if (!s || s.toLowerCase() === "any" || s.toLowerCase() === "unknown") return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The call-sheet line: gender · age · category · tone · emotion · run time · words. */
function metaFor(monologue: Monologue): string[] {
  const minutes = Math.floor(monologue.estimated_duration_seconds / 60);
  const seconds = monologue.estimated_duration_seconds % 60;

  return [
    clean(monologue.character_gender),
    monologue.character_age_range && monologue.character_age_range.toLowerCase() !== "any"
      ? monologue.character_age_range
      : null,
    clean(monologue.category),
    clean(monologue.tone),
    clean(monologue.primary_emotion),
    monologue.estimated_duration_seconds
      ? `${minutes}:${seconds.toString().padStart(2, "0")}`
      : null,
    /* Word count is gone. It sat next to the running time saying the same thing
       twice, and of the two only one is the answer to a real question — an
       actor is given "under two minutes", never "under 300 words". Six facts
       wrapped to two lines on a phone and pushed the piece itself below the
       fold; five fit on one. */
  ].filter((x): x is string => Boolean(x));
}

/**
 * Who's speaking, and from where. The character name is the headline because
 * that's what an actor is casting themselves as — the play is the address, not
 * the subject. Set in the wordmark face so it matches every other big title.
 */
export function MonologueHeader({
  monologue,
  headerActions,
}: {
  monologue: Monologue;
  headerActions?: React.ReactNode;
}) {
  const meta = metaFor(monologue);
  const author = displayableAuthor(monologue.author);

  return (
    /* Tighter than it was (space-y-5, a 4xl/5xl name and a 5-line stack), so
       the monologue starts near the top of the screen instead of below it. On a
       390px phone the old header ran 268px before a word of the piece — you
       scrolled to reach the thing you opened the page for. */
    <header className="space-y-3">
      <div className="flex items-start gap-4 sm:gap-5">
        {monologue.poster_url && (
          <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-sm sm:h-40 sm:w-[106px]">
            <Image
              src={monologue.poster_url}
              alt={monologue.play_title || "Poster"}
              width={128}
              height={192}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* The source sits above the name as an eyebrow so the name can be the
              one big thing, instead of a title competing with a subtitle.
              Styled like a stage direction but NOT with .stage-direction — that
              class lower-cases everything, which mangles "The Seagull" and the
              author's name. */}
          <p className="font-typewriter text-xs italic tracking-[0.08em] text-muted-foreground/80 sm:text-sm">
            from {monologue.play_title}
            {author ? `, by ${author}` : ""}
          </p>

          <h1 className="mt-1 font-brand text-3xl font-medium leading-[1.05] text-foreground sm:text-5xl">
            {monologue.character_name}
          </h1>

          {isMeaningfulMonologueTitle(
            monologue.title,
            monologue.character_name,
            monologue.play_title,
          ) && <p className="mt-2 text-base text-foreground/70">{monologue.title}</p>}
        </div>

        {headerActions}
      </div>

      {meta.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {/* No `capitalize` here: clean() already title-cases the descriptive
              entries, and the class turned "312 words" into "312 Words". */}
          {meta.map((m, i) => (
            <span key={m} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground/40">·</span>}
              <span>{m}</span>
            </span>
          ))}
        </div>
      )}

      {monologue.scene_description && (
        <p className="border-l-2 border-primary/30 pl-3 text-[13px] italic leading-relaxed text-muted-foreground">
          {monologue.scene_description}
        </p>
      )}
    </header>
  );
}

/**
 * The piece itself. `measured` opens it up to a reading column — bigger type,
 * looser leading, a line length you can actually hold your eye on — for the
 * full detail page. The slide-over panel leaves it off and stays compact.
 */
export function MonologueBody({
  monologue,
  measured = false,
}: {
  monologue: Monologue;
  measured?: boolean;
}) {
  if (isBibliographicText(monologue.text)) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Text not available</p>
        <p>This entry appears to contain catalog data rather than the monologue itself.</p>
        {monologue.source_url && (
          <a
            href={monologue.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View source
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stageDirectionPercentage(monologue.text) > 50 && (
        <p className="text-xs text-muted-foreground">
          Stage directions are dimmed; the spoken lines are in normal text.
        </p>
      )}
      <div
        className={
          measured
            ? "mx-auto max-w-[62ch] font-typewriter text-[17px] leading-[1.9] sm:text-[18px]"
            : "font-typewriter text-base leading-relaxed"
        }
      >
        {monologue.text_segments && monologue.text_segments.length > 0 ? (
          <MonologueTextRenderer text={monologue.text} segments={monologue.text_segments} />
        ) : (
          <MonologueText text={monologue.text} />
        )}
      </div>

      {/* End mark. A piece should finish somewhere, not just stop. */}
      {measured && (
        <div className="flex justify-center pt-6">
          <GhostLightSketch size={34} delay={0.2} className="text-muted-foreground/25" />
        </div>
      )}
    </div>
  );
}

/** Quiet stats, the moderator edit link, and where the text came from. */
export function MonologueFooter({
  monologue,
  onEdit,
}: {
  monologue: Monologue;
  onEdit?: (monologueId: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-4">
        <span>{monologue.view_count} views</span>
        <span>{monologue.favorite_count} saved</span>
        {monologue.overdone_score > 0.7 && (
          <span className="text-amber-600">Frequently performed</span>
        )}
      </span>
      <span className="flex items-center gap-3">
        {onEdit && (
          <button
            onClick={() => onEdit(monologue.id)}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <IconEdit className="h-3.5 w-3.5" /> Edit
          </button>
        )}
        {monologue.source_url && (
          <a
            href={monologue.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {monologue.source_type === "film" || monologue.source_type === "tv"
              ? "View script"
              : "View full play"}
            <IconExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </span>
    </div>
  );
}

/**
 * Header + piece + footer in one go, for the search slide-over. The full detail
 * page composes the same three parts itself so it can slot the cut/copy modes
 * in between — see app/(platform)/monologue/[id]/page.tsx.
 */
export function MonologueDetailContent({
  monologue,
  headerActions,
  onEdit,
}: MonologueDetailContentProps) {
  return (
    <div className="space-y-6">
      <MonologueHeader monologue={monologue} headerActions={headerActions} />
      <MonologueBody monologue={monologue} />
      <MonologueFooter monologue={monologue} onEdit={onEdit} />
    </div>
  );
}
