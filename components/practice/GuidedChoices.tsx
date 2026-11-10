"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import api from "@/lib/api";
import { guidedRoute, openingPart, titleCase, type GuidedChoice } from "@/lib/guided-scene";
import { fetchGuidedScenes, startGuidedScene, type GuidedDoor } from "@/lib/guided-start";
import { useT } from "@/lib/i18n";

/**
 * The three first scenes (a fight, a flirt, a confession), one tap each. The
 * tap starts the scene as the part that speaks first (the server names it,
 * `opens`), straight onto the actor's first line; there is nothing to choose
 * after. Canberk, 2026-11-10: actors stalled when their first move was
 * answering a stranger, so the answering part is no longer offered.
 *
 * Shared by the hub's invitation and the onboarding ending. `onLeaving` runs
 * just before the route changes (the onboarding card closes itself there).
 */
export function GuidedChoices({ from, onLeaving }: { from: GuidedDoor; onLeaving?: () => void }) {
  const router = useRouter();
  const t = useT();
  const [scenes, setScenes] = useState<GuidedChoice[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Fetched, then warmed while they read: the rehearse page's chunk and each
  // scene's payload. Asking for the payload is what queues the partner audio
  // on the server, so the first line is there by the time they tap.
  useEffect(() => {
    let cancelled = false;
    fetchGuidedScenes()
      .then((list) => {
        if (cancelled) return;
        setScenes(list);
        if (list.length === 0) setFailed(true);
        for (const s of list) {
          router.prefetch(guidedRoute(s.scene_id));
          void api.get(`/api/rehearsal/scenes/${s.scene_id}`).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Synchronous up to startGuidedScene: the audio context is started inside this tap.
  const pick = (scene: GuidedChoice, part: string) => {
    if (starting) return;
    setStarting(`${scene.key}:${part}`);
    setFailed(false);
    startGuidedScene(from, scene, part)
      .then((route) => {
        onLeaving?.();
        router.push(route);
      })
      .catch(() => {
        setFailed(true);
        setStarting(null);
      });
  };

  return (
    <div className="t-pick-host">
    <div className="t-pick" data-starting={starting !== null}>
      {scenes?.map((scene) => (
        <section key={scene.key} className="t-pick__scene" aria-labelledby={`pick-${scene.key}`}>
          <h3 id={`pick-${scene.key}`} className="t-pick__title">{scene.title}</h3>
          {scene.hook && <p className="t-pick__hook">{scene.hook}</p>}
          {(() => {
            const part = openingPart(scene);
            if (!part) return null;
            const mine = starting === `${scene.key}:${part.name}`;
            return (
              <div className="t-pick__parts">
                <button
                  type="button"
                  className="t-pick__part"
                  onClick={() => pick(scene, part.name)}
                  disabled={starting !== null}
                  aria-label={t("appPracticeGuided.playAs", { name: titleCase(part.name), who: part.line ?? "" })}
                >
                  <span className="t-pick__name">{mine ? t("appPracticeGuided.oneMoment") : titleCase(part.name)}</span>
                  {part.line && <span className="t-pick__who">{part.line}</span>}
                </button>
              </div>
            );
          })()}
        </section>
      ))}
      {failed && (
        <p className="t-pick__failed" role="alert">
          {t("appPracticeGuided.failed")}
        </p>
      )}
    </div>
    </div>
  );
}
