"use client";

import { IconExternalLink, IconEdit } from "@tabler/icons-react";
import Image from "next/image";
import { Monologue } from "@/types/actor";
import { isMeaningfulMonologueTitle } from "@/lib/utils";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueTextRenderer } from "@/components/monologue/MonologueTextRenderer";
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

/**
 * Calm, single-column detail view: character + source, one quiet metadata line,
 * the scene, then the piece itself as the clear focus, and a light footer.
 * Deliberately flat — no competing "Details / Analysis" sections or stat cards —
 * so the eye goes to the monologue, not the chrome.
 */
export function MonologueDetailContent({
  monologue,
  headerActions,
  onEdit,
}: MonologueDetailContentProps) {
  const minutes = Math.floor(monologue.estimated_duration_seconds / 60);
  const seconds = monologue.estimated_duration_seconds % 60;

  const meta = [
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
    monologue.word_count ? `${monologue.word_count} words` : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="space-y-6">
      {/* Header: character, title, source — and the primary action */}
      <div className="flex items-start justify-between gap-4">
        {monologue.poster_url && (
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            <Image
              src={monologue.poster_url}
              alt={monologue.play_title || "Poster"}
              width={64}
              height={96}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className="text-3xl font-semibold leading-tight sm:text-4xl"
            style={{ fontFamily: "var(--font-sans), Georgia, serif" }}
          >
            {monologue.character_name}
          </h1>
          {isMeaningfulMonologueTitle(monologue.title, monologue.character_name) && (
            <p className="mt-1 text-base text-foreground/70">{monologue.title}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {monologue.play_title}
            {monologue.author ? ` · ${monologue.author}` : ""}
          </p>
        </div>
        {headerActions}
      </div>

      {/* One quiet metadata line (replaces the old Details + Analysis blocks) */}
      {meta.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {meta.map((m, i) => (
            <span key={m} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground/40">·</span>}
              <span className="capitalize">{m}</span>
            </span>
          ))}
        </div>
      )}

      {/* Scene, if we have one */}
      {monologue.scene_description && (
        <p className="border-l-2 border-primary/30 pl-3 text-sm italic leading-relaxed text-muted-foreground">
          {monologue.scene_description}
        </p>
      )}

      {/* The piece — the focus */}
      {isBibliographicText(monologue.text) ? (
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
      ) : (
        <div className="space-y-3">
          {stageDirectionPercentage(monologue.text) > 50 && (
            <p className="text-xs text-muted-foreground">
              Stage directions are dimmed; the spoken lines are in normal text.
            </p>
          )}
          <div className="font-typewriter text-base leading-relaxed">
            {monologue.text_segments && monologue.text_segments.length > 0 ? (
              <MonologueTextRenderer text={monologue.text} segments={monologue.text_segments} />
            ) : (
              <MonologueText text={monologue.text} />
            )}
          </div>
        </div>
      )}

      {/* Light footer: quiet stats, edit (mods), and the source link */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-4">
          <span>{monologue.view_count} views</span>
          <span>{monologue.favorite_count} saved</span>
          {monologue.overdone_score > 0.7 && <span className="text-amber-600">Frequently performed</span>}
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
    </div>
  );
}
