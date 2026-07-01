"use client";

import { Monologue } from "@/types/actor";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { isMeaningfulMonologueTitle } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { IconExternalLink, IconSparkles, IconPlus, IconCheck, IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { useToggleFavorite } from "@/hooks/useBookmarks";

interface MonologueCardProps {
  monologue: Monologue;
  index?: number;
}

export function MonologueCard({ monologue, index = 0 }: MonologueCardProps) {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const toggleFavorite = useToggleFavorite();
  const isInCollection = !!monologue.is_favorited;

  // One tap: pass the CURRENT favorited state so the hook toggles it.
  const handleCollection = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite.mutate({ monologueId: monologue.id, isFavorited: isInCollection });
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <motion.div
        whileHover={{ scale: 1.02, y: -4 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="hover:shadow-xl transition-all duration-300 hover:border-primary/50 h-full flex flex-col">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-base sm:text-lg lg:text-xl mb-2 line-clamp-2 break-words">
                {isMeaningfulMonologueTitle(monologue.title, monologue.character_name)
                  ? monologue.title
                  : monologue.character_name}
              </CardTitle>
                <CardDescription className="text-base">
                  by {monologue.author}
                  {monologue.translator ? `, translated by ${monologue.translator}` : ""}
                </CardDescription>
              </div>
              {isInCollection ? (
                <button
                  type="button"
                  onClick={handleCollection}
                  disabled={toggleFavorite.isPending}
                  aria-label="In your collection. Tap to remove."
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 dark:text-emerald-400 cursor-pointer transition-colors hover:bg-emerald-500/20"
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  In collection
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCollection}
                  disabled={toggleFavorite.isPending}
                  aria-label="Add to collection"
                  className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground border border-border cursor-pointer transition-colors hover:text-primary hover:border-primary/40 hover:bg-primary/5"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Add to collection
                </button>
              )}
              {monologue.relevance_score !== undefined && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={inView ? { scale: 1 } : { scale: 0 }}
                  transition={{ delay: index * 0.1 + 0.2, type: "spring" }}
                  className="flex flex-col items-end gap-2"
                >
                  <div className="flex items-center gap-1 text-foreground">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <IconSparkles className="h-4 w-4" />
                    </motion.div>
                    <span className="text-sm font-medium tabular-nums">
                      {Math.round(monologue.relevance_score * 100)}% match
                    </span>
                  </div>
                  <div className="w-20">
                    <Progress value={monologue.relevance_score * 100} className="h-1.5" />
                  </div>
                </motion.div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{monologue.age_range}</Badge>
              <Badge variant="outline">{monologue.gender}</Badge>
              <Badge variant="outline">{monologue.genre}</Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {monologue.excerpt}
            </p>
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-2 mt-auto">
            {/* Primary action: bridge straight from a found monologue into
                practicing it (memorize + self-record), instead of dead-ending
                on "add to collection". */}
            <Link
              href={`/monologue/${monologue.id}/memorize`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#CB4B00] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#B03000]"
            >
              Practice this
              <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
            <div className="flex items-center gap-3">
              {monologue.source_url && (
                <motion.a
                  href={monologue.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline flex items-center gap-1"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Source
                  <IconExternalLink className="h-3 w-3" />
                </motion.a>
              )}
              {monologue.full_text_url && (
                <motion.a
                  href={monologue.full_text_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline flex items-center gap-1"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Full Text
                  <IconExternalLink className="h-3 w-3" />
                </motion.a>
              )}
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </motion.div>
  );
}

