"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { IconCheck, IconArrowBackUp } from "@tabler/icons-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monologue } from "@/types/actor";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useToggleFavorite } from "@/hooks/useBookmarks";

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes}min`;
}

function relativeTime(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  const days = Math.floor(diff / day);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

interface CollectionCardProps {
  monologue: Monologue;
}

export function CollectionCard({ monologue }: CollectionCardProps) {
  const router = useRouter();
  const mark = useToggleMemorized();
  const toggleFavorite = useToggleFavorite();

  const memorized = Boolean(monologue.memorized);
  const duration = formatDuration(monologue.estimated_duration_seconds);
  const memorizeHref = `/monologue/${monologue.id}/memorize`;

  const meta = [monologue.character_name, monologue.play_title, monologue.author]
    .filter(Boolean)
    .join(" · ");

  const studied = relativeTime(monologue.last_studied_at);
  const notes = monologue.notes?.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="h-full"
    >
      <Card className="flex h-full flex-col gap-5 border-border bg-card p-6 transition-shadow hover:shadow-md">
        <div className="space-y-2">
          <Link
            href={memorizeHref}
            className="block text-xl font-semibold leading-tight tracking-tight text-foreground transition-colors hover:text-foreground/70 sm:text-2xl"
          >
            {monologue.title}
          </Link>
          {meta && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {meta}
              {duration && (
                <span className="text-muted-foreground/70"> · {duration}</span>
              )}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {studied ? `Studied ${studied}` : "Not started yet"}
          </p>
          {notes && (
            <p className="truncate text-xs italic text-muted-foreground/80">
              {notes}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(memorizeHref)}
          >
            Memorize
          </Button>

          {memorized ? (
            <>
              <span className="inline-flex items-center gap-1 border border-emerald-600/25 bg-emerald-600/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <IconCheck className="size-3.5" />
                Memorized
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                onClick={() =>
                  mark.mutate({ monologueId: monologue.id, memorized: false })
                }
              >
                <IconArrowBackUp className="size-3.5" />
                Move to study
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              onClick={() =>
                mark.mutate({ monologueId: monologue.id, memorized: true })
              }
            >
              Mark memorized
            </button>
          )}

          <button
            type="button"
            className="ml-auto text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
            onClick={() =>
              toggleFavorite.mutate({
                monologueId: monologue.id,
                isFavorited: true,
              })
            }
          >
            Remove
          </button>
        </div>
      </Card>
    </motion.div>
  );
}
