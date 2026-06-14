"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, ArrowLeft } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

type ColdReadLine = {
  line_order: number;
  character_name: string;
  text: string;
  stage_direction?: string | null;
};

type ColdReadScene = {
  title: string;
  play_title?: string;
  play_author?: string;
  lines: ColdReadLine[];
};

/**
 * In-editor cold-read stage.
 *
 * Crossfades in over the scene editor so the edit chrome recedes and the script
 * comes into focus — same screen, just "settled" into a read-through. Self-paced
 * (no countdown): the actor scans the scene, then taps "Begin performance" to
 * launch the single take. "Back to editing" returns to the editor.
 *
 * Styled to match the editor's light parchment so the transition reads as the
 * page focusing rather than navigating somewhere new.
 */
export function ColdReadStage({
  sceneId,
  userCharacter,
  onBegin,
  onExit,
}: {
  sceneId: string;
  userCharacter?: string | null;
  onBegin: () => void;
  onExit: () => void;
}) {
  const [scene, setScene] = useState<ColdReadScene | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ColdReadScene>(`/api/scenes/${sceneId}`)
      .then((r) => { if (!cancelled) setScene(r.data); })
      .catch(() => { /* leave loading; user can still Back to editing */ });
    return () => { cancelled = true; };
  }, [sceneId]);

  const title = scene?.title ?? "Loading scene…";
  const playTitle = scene?.play_title;
  const lines = scene?.lines ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-primary">Cold read</p>
            <h1 className="truncate text-lg font-semibold leading-tight text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">
              Read it through at your own pace. One take, no restarts.
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to editing</span>
          </button>
        </div>
      </motion.div>

      {/* Script */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mx-auto max-w-3xl"
          style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
          {playTitle && (
            <p className="mb-5 text-center text-sm text-muted-foreground">from {playTitle}</p>
          )}
          <div className="space-y-3">
            {lines.map((line, i) => {
              const mine = !!userCharacter && line.character_name === userCharacter;
              const prevSpeaker = i > 0 ? lines[i - 1].character_name : null;
              const showSpeaker = line.character_name !== prevSpeaker;
              return (
                <div key={line.line_order} className={mine ? "border-l-2 border-primary/60 pl-3" : "pl-3"}>
                  {showSpeaker && (
                    <p className={`text-xs font-bold uppercase tracking-widest ${mine ? "text-primary" : "text-muted-foreground"}`}>
                      {line.character_name}
                      {mine && <span className="ml-1.5 font-medium normal-case tracking-normal">(you)</span>}
                    </p>
                  )}
                  <p className={`leading-relaxed ${mine ? "text-foreground" : "text-muted-foreground"}`}>
                    {line.stage_direction?.trim() && (
                      <span className="italic text-muted-foreground/70">({line.stage_direction.trim()}) </span>
                    )}
                    {line.text}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Begin bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl justify-center">
          <Button onClick={onBegin} size="lg" className="min-h-[52px] w-full max-w-sm gap-2 text-base">
            <Play className="h-5 w-5" />
            Begin performance
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
