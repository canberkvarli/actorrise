"use client";

import { useEffect, useState } from "react";
import { IconClockHour4 } from "@tabler/icons-react";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";

const PREP_SECONDS = 45;

type SceneLine = {
  line_order: number;
  character_name: string;
  text: string;
  stage_direction?: string | null;
};

type SceneDetail = {
  title: string;
  play_title?: string;
  play_author?: string;
  lines: SceneLine[];
};

/**
 * Cold-read prep: a timed read-through shown before the performance begins.
 * The actor gets ~45s to scan the scene, then it's one take, no restarts.
 * Renders full-screen on the dark rehearse surface; calls onReady() when the
 * timer hits zero or the actor taps "Start performance".
 */
export function ColdReadPrep({
  sceneId,
  userCharacter,
  onReady,
}: {
  sceneId: string;
  userCharacter?: string | null;
  onReady: () => void;
}) {
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [seconds, setSeconds] = useState(PREP_SECONDS);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SceneDetail>(`/api/scenes/${sceneId}`)
      .then((r) => {
        if (!cancelled) setScene(r.data);
      })
      .catch(() => {
        // If the scene can't load, don't trap the user on the prep screen.
        if (!cancelled) onReady();
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId, onReady]);

  useEffect(() => {
    if (seconds <= 0) {
      onReady();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onReady]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-5 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-primary">Cold read</p>
            <h1 className="text-xl font-bold leading-tight">
              {scene?.title ?? "Loading scene…"}
            </h1>
            <p className="mt-0.5 text-xs text-neutral-400">
              Read it through. One take, no restarts.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 border border-neutral-700 px-3 py-1.5 tabular-nums">
            <IconClockHour4 className="h-4 w-4 text-primary" />
            <span className="text-lg font-semibold">0:{String(seconds).padStart(2, "0")}</span>
          </div>
        </div>

        <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
          {scene?.lines.map((line, i) => {
            const mine = userCharacter && line.character_name === userCharacter;
            const prevSpeaker = i > 0 ? scene.lines[i - 1].character_name : null;
            const showSpeaker = line.character_name !== prevSpeaker;
            return (
              <div key={line.line_order}>
                {showSpeaker && (
                  <p
                    className={`text-[11px] uppercase tracking-wide ${
                      mine ? "text-primary" : "text-neutral-500"
                    }`}
                  >
                    {line.character_name}
                  </p>
                )}
                <p className={`leading-relaxed ${mine ? "text-neutral-50" : "text-neutral-300"}`}>
                  {line.stage_direction && (
                    <span className="text-neutral-500">[{line.stage_direction}] </span>
                  )}
                  {line.text}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 shrink-0">
          <Button
            className="w-full border border-neutral-600 bg-primary text-white hover:bg-primary/90"
            onClick={onReady}
          >
            Start performance
          </Button>
        </div>
      </div>
    </div>
  );
}
