"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  IconCheck,
  IconCircleCheck,
  IconArrowBackUp,
} from "@tabler/icons-react";

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

interface CollectionCardProps {
  monologue: Monologue;
}

export function CollectionCard({ monologue }: CollectionCardProps) {
  const router = useRouter();
  const mark = useToggleMemorized();
  const toggleFavorite = useToggleFavorite();

  const memorized = Boolean(monologue.memorized);
  const duration = formatDuration(monologue.estimated_duration_seconds);

  const meta = [monologue.character_name, monologue.play_title, monologue.author]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="h-full"
    >
      <Card className="flex h-full flex-col gap-4 rounded-lg p-5 transition-shadow hover:shadow-md">
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold leading-snug">{monologue.title}</h3>
          {meta && (
            <p className="text-sm text-muted-foreground">{meta}</p>
          )}
          {duration && (
            <p className="text-xs text-muted-foreground">{duration}</p>
          )}
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => router.push(`/monologue/${monologue.id}/memorize`)}
            >
              Memorize
            </Button>

            {memorized ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  <IconCircleCheck className="size-3.5" />
                  Memorized
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() =>
                    mark.mutate({ monologueId: monologue.id, memorized: false })
                  }
                >
                  <IconArrowBackUp className="size-3.5" />
                  Move to study
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  mark.mutate({ monologueId: monologue.id, memorized: true })
                }
              >
                <IconCheck className="size-4" />
                Mark memorized
              </Button>
            )}
          </div>

          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
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
