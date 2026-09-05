"use client";

import { IconExternalLink, IconEdit } from "@tabler/icons-react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Monologue } from "@/types/actor";
import { isMeaningfulMonologueTitle, displayableAuthor } from "@/lib/utils";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueTextRenderer } from "@/components/monologue/MonologueTextRenderer";
import { GhostLightSketch } from "@/components/brand/sketches";
import { isBibliographicText, stageDirectionPercentage } from "@/lib/monologueText";
import { posterAt, overdoneBand } from "@/lib/poster";

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

/** The casting line: what an actor actually filters on. */
function castingFacts(monologue: Monologue): string[] {
  const secs = monologue.estimated_duration_seconds;
  return [
    clean(monologue.character_gender),
    monologue.character_age_range && monologue.character_age_range.toLowerCase() !== "any"
      ? monologue.character_age_range
      : null,
    clean(monologue.category),
    clean(monologue.tone),
    clean(monologue.primary_emotion),
    secs ? `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}` : null,
  ].filter((x): x is string => Boolean(x));
}

/**
 * How often a room hears this piece. Only rendered for pieces the scorer has
 * actually reached — see overdoneBand(), which returns null on an unscored 0
 * rather than calling twelve thousand monologues "Fresh" on no evidence.
 */
export function OverdoneMark({ score }: { score: number | null | undefined }) {
  const band = overdoneBand(score);
  if (!band) return null;
  const tone = [
    "text-teal-700 dark:text-teal-300",   // Fresh
    "text-foreground/70",                  // Recognizable
    "text-amber-700 dark:text-amber-400",  // Common
    "text-rose-700 dark:text-rose-400",    // Warhorse
  ][band.level];
  return (
    <span
      title={
        band.level >= 2
          ? "You will not be the only one bringing this today."
          : "How often a casting room hears this piece."
      }
      className={`inline-flex items-center gap-1.5 font-typewriter text-[11px] uppercase tracking-[0.16em] ${tone}`}
    >
      {/* Four ticks, filled to the heat. Sharp, because it is a readout and
          not something you can press. */}
      <span aria-hidden className="inline-flex gap-[2px]">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-2.5 w-[3px] ${i <= band.level ? "bg-current" : "bg-current opacity-20"}`}
          />
        ))}
      </span>
      {band.label}
    </span>
  );
}

/**
 * Same readout, over the poster. The themed variant's teal and amber were
 * picked to carry on the page background and go muddy against a photograph,
 * so on the banner the ticks stay white and only the warm bands take colour.
 */
function OverdoneOnDark({ score }: { score: number | null | undefined }) {
  const band = overdoneBand(score);
  if (!band) return null;
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="text-white/30">·</span>
      <span
        className={`inline-flex items-center gap-1.5 font-typewriter text-[11px] uppercase tracking-[0.16em] ${
          band.level >= 2 ? "text-amber-300" : "text-white/75"
        }`}
      >
        <span aria-hidden className="inline-flex gap-[2px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-2.5 w-[3px] ${i <= band.level ? "bg-current" : "bg-current opacity-25"}`}
            />
          ))}
        </span>
        {band.label}
      </span>
    </span>
  );
}

/**
 * The one-sheet. A film piece gets the poster it deserves: large and sharp,
 * with a blurred enlargement of itself behind as atmosphere, the character
 * name over the top, and a billing block the way a poster carries one. The
 * page then drops into the warm reading canvas for the piece — the dark
 * outside / lit page contrast the app already runs on.
 *
 * Three things this puts on screen that the endpoint has always sent and
 * nothing has ever rendered: `year`, `director`, `imdb_rating`.
 *
 * A play has no poster and gets the typographic variant below instead. Giving
 * it a darkened banner with nothing behind it would be drama with no source.
 */
export function MonologueOneSheet({ monologue }: { monologue: Monologue }) {
  const author = displayableAuthor(monologue.author);
  const facts = castingFacts(monologue);
  const poster = posterAt(monologue.poster_url, 600);
  const backdrop = posterAt(monologue.poster_url, 400);

  if (!poster) return <MonologueHeader monologue={monologue} standalone />;

  // The billing block, the way a one-sheet carries one.
  const billing = [
    monologue.year ? String(monologue.year) : null,
    monologue.director,
    monologue.imdb_rating ? `★ ${monologue.imdb_rating.toFixed(1)}` : null,
  ].filter(Boolean) as string[];

  return (
    <header className="relative isolate overflow-hidden">
      {/* Atmosphere. The poster's own colours, blurred past recognition, so
          every film gets a header keyed to itself without shipping a palette
          extractor. aria-hidden: it carries no information the sharp copy
          beside it doesn't already state. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image
          src={backdrop as string}
          alt=""
          fill
          unoptimized
          className="scale-125 object-cover blur-2xl saturate-[1.35]"
        />
        {/* Four stops, not two. A plain from/via/to ramp is already half faded
            by the time it reaches the casting line and the overdone mark, and
            white type on a near-background wash is unreadable — the first
            render put "RECOGNIZABLE" almost invisibly on cream. The ramp now
            holds most of its darkness to 80% and drops to the page background
            in the last stretch, below the type, so the banner still dissolves
            into the reading canvas instead of ending on a hard line. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.74) 45%, rgba(0,0,0,0.70) 80%, var(--background) 100%)",
          }}
        />
      </div>

      {/* pb runs long on purpose: it puts the gradient's fade-out below the
          last line of type rather than behind it. */}
      <div className="container mx-auto max-w-3xl px-4 pb-16 pt-6 sm:pb-20 sm:pt-8">
        <div className="flex items-end gap-5 sm:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 18, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-[38%] max-w-[190px] shrink-0 sm:max-w-[230px]"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-sm shadow-[0_22px_50px_-18px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
              <Image
                src={poster}
                alt={`${monologue.play_title} poster`}
                fill
                unoptimized
                sizes="(max-width: 640px) 38vw, 230px"
                className="object-cover"
                priority
              />
            </div>
          </motion.div>

          <div className="min-w-0 flex-1 pb-1">
            <p className="font-typewriter text-[11px] italic tracking-[0.08em] text-white/70 sm:text-sm">
              from {monologue.play_title}
            </p>

            {/* Playfair, per the app-wide rule that every big title matches the
                hero. The condensed face below is a credit block, not a title. */}
            <h1 className="mt-1.5 font-brand text-[clamp(1.75rem,7vw,3.5rem)] font-medium leading-[1.02] text-white">
              {monologue.character_name}
            </h1>

            {billing.length > 0 && (
              <p className="font-playbill mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/85 sm:text-base">
                {billing.map((b, i) => (
                  <span key={b} className="flex items-center gap-2.5">
                    {i > 0 && <span aria-hidden className="text-white/30">·</span>}
                    {b}
                  </span>
                ))}
              </p>
            )}

            <div className="mt-3.5 hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70 sm:flex">
              {facts.map((f, i) => (
                <span key={f} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden className="text-white/30">·</span>}
                  <span>{f}</span>
                </span>
              ))}
              <OverdoneOnDark score={monologue.overdone_score} />
            </div>
          </div>
        </div>

        {/* On a phone the casting facts go under the whole block rather than
            into the ~150px column beside the poster, where five of them wrap
            to four lines and shove the poster taller than the screen. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70 sm:hidden">
          {facts.map((f, i) => (
            <span key={f} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-white/30">·</span>}
              <span>{f}</span>
            </span>
          ))}
          <OverdoneOnDark score={monologue.overdone_score} />
        </div>

        {monologue.scene_description && (
          <p className="mt-5 max-w-xl border-l-2 border-white/25 pl-3 text-[13px] italic leading-relaxed text-white/75">
            {monologue.scene_description}
          </p>
        )}
      </div>
    </header>
  );
}

/**
 * Who's speaking, and from where. The character name is the headline because
 * that's what an actor is casting themselves as — the play is the address, not
 * the subject. Set in the wordmark face so it matches every other big title.
 *
 * This is the compact variant: the search slide-over, and any play (no poster).
 * `standalone` gives it the breathing room of a page header rather than a panel.
 */
export function MonologueHeader({
  monologue,
  headerActions,
  standalone = false,
}: {
  monologue: Monologue;
  headerActions?: React.ReactNode;
  standalone?: boolean;
}) {
  const meta = metaFor(monologue);
  const author = displayableAuthor(monologue.author);

  return (
    /* Tighter than it was (space-y-5, a 4xl/5xl name and a 5-line stack), so
       the monologue starts near the top of the screen instead of below it. On a
       390px phone the old header ran 268px before a word of the piece — you
       scrolled to reach the thing you opened the page for. */
    <header className={standalone ? "space-y-4" : "space-y-3"}>
      <div className="flex items-start gap-4 sm:gap-5">
        {/* Only the panel still shows a thumbnail. On a page a poster this size
            is a stamp beside a headline; the full-bleed one-sheet handles it. */}
        {!standalone && monologue.poster_url && (
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

          <h1
            className={`mt-1 font-brand font-medium leading-[1.02] text-foreground ${
              standalone
                ? "text-[clamp(2.1rem,9vw,4.25rem)]"
                : "text-3xl leading-[1.05] sm:text-5xl"
            }`}
          >
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

      {standalone && <div className="h-px w-full bg-border/70" />}

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
          {standalone && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <OverdoneMark score={monologue.overdone_score} />
            </>
          )}
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
      {/* Was "86 views · 1 saved". Neither answers a question an actor has, and
          a low save count on a good piece argues against it for no reason —
          the number measures how long we have had the row, not the monologue.
          "Frequently performed" also lived here, three screens below the point
          of decision; it is a proper readout in the header now. */}
      <span className="flex items-center gap-4">
        {monologue.word_count > 0 && <span>{monologue.word_count} words</span>}
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
