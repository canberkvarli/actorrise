"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  IconArrowLeft,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStopFilled,
  IconVolume,
} from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { entrance } from "@/lib/motion";
import { formatSceneDuration } from "@/lib/scenes";
import {
  AI_VOICES,
  getCharacterVoices,
  getMyRoles,
  setCharacterVoices,
  setMyRoles,
  voiceById,
  withDefaultVoices,
  type CharacterVoices,
} from "@/lib/scenePrefs";
import { useOpenAITTS } from "@/hooks/useOpenAITTS";
import { parseUpgradeError } from "@/lib/upgradeError";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The scene, before you run it.
 *
 * Tapping a scene used to open the EDITOR — four thousand lines of line-level
 * editing, character renaming, reordering and voice assignment — and an actor
 * who only wanted to rehearse read that as "a preview", because it is what
 * stands between the acts list and the rehearsal room. It did not look like a
 * preview and did not behave like one, so nobody could tell what pressing
 * anything would do.
 *
 * This is the preview. It answers the three questions you actually have
 * standing in front of a scene — what is this, who am I, what do the others
 * sound like — and then has one loud way on. It is sides: the scene's own
 * head, the cast, and the top of the dialogue set on paper.
 *
 * Everything editable is still there, one tap away under "edit the scene". The
 * two decisions that belong to rehearsing rather than editing — which part is
 * yours, and the voices — are made HERE, because they are the two things you
 * must settle before a run and the only two the old editor made you hunt for.
 */

interface SceneLine {
  id: number;
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
}

interface SceneDetail {
  id: number;
  play_title: string;
  play_author: string;
  title: string;
  act: string | null;
  scene_number: string | null;
  description: string | null;
  character_1_name: string;
  character_2_name: string;
  setting: string | null;
  tone: string | null;
  line_count: number;
  estimated_duration_seconds: number;
  rehearsal_count: number;
  lines: SceneLine[];
}

/** "act one, scene two." — the slug line, lowercase, in the direction face. */
function slugFor(scene: SceneDetail): string {
  const bits = [scene.act, scene.scene_number].filter(Boolean).join(", ");
  return bits ? `(${bits.toLowerCase()}.)` : "(the scene.)";
}

export default function ScenePreviewPage() {
  const router = useRouter();
  const params = useParams();
  const scriptId = params.id as string;
  const sceneId = Number(params.sceneId);
  const reduce = useReducedMotion();

  const { data: scene, isLoading } = useSWR<SceneDetail>(
    Number.isFinite(sceneId) ? `/api/scenes/${sceneId}` : null,
    () => api.get<SceneDetail>(`/api/scenes/${sceneId}`).then((r) => r.data),
    { revalidateOnFocus: false },
  );

  /* Overrides, not state-of-record. Both of these are DERIVED from storage and
     only replaced once the actor touches them — an effect that seeded state
     after mount would be a setState in an effect, which is the cascading
     render this repo's React rules reject, and it would also flash the default
     role for a frame before the saved one landed. Nothing here is read until
     `scene` exists, which only happens client-side, so there is no snapshot to
     mismatch on hydration. */
  const [rolesPicked, setRolesPicked] = useState<string[] | null>(null);
  const [voicesPicked, setVoicesPicked] = useState<CharacterVoices | null>(null);
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [upgrade, setUpgrade] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  const tts = useOpenAITTS({
    onEnd: () => setAuditioning(null),
    onError: () => setAuditioning(null),
  });

  /** Everyone who speaks, in the order they first speak. */
  const cast = useMemo(() => {
    if (!scene) return [];
    const seen: string[] = [];
    for (const l of scene.lines) {
      const n = l.character_name?.trim();
      if (n && !seen.includes(n)) seen.push(n);
    }
    // A scene with no lines yet still has its two named parts.
    for (const n of [scene.character_1_name, scene.character_2_name]) {
      if (n && !seen.includes(n)) seen.push(n);
    }
    return seen;
  }, [scene]);

  /* What the actor decided last time, falling back to the scene's first part.
     The editor never remembered this, so a returning actor met "Please select a
     character first" on a scene they had already run twice. */
  const roles = useMemo(() => {
    if (rolesPicked) return rolesPicked;
    if (!scene || cast.length === 0) return [];
    const saved = getMyRoles(scene.id).filter((r) => cast.includes(r));
    return saved.length ? saved : [cast[0]];
  }, [rolesPicked, scene, cast]);

  const voices = useMemo(
    () => voicesPicked ?? (scene ? getCharacterVoices(scene.id) : {}),
    [voicesPicked, scene],
  );

  const mine = roles[0] ?? "";
  const theirs = useMemo(() => cast.filter((c) => !roles.includes(c)), [cast, roles]);
  const fullVoices = useMemo(() => withDefaultVoices(cast, voices), [cast, voices]);

  const chooseRole = (name: string) => {
    if (!scene) return;
    const next = [name];
    setRolesPicked(next);
    setMyRoles(scene.id, next);
  };

  const chooseVoice = (character: string, voiceId: string) => {
    if (!scene) return;
    const next = { ...fullVoices, [character]: voiceId };
    setVoicesPicked(next);
    setCharacterVoices(scene.id, next);
  };

  /** Hear a voice on a real line of theirs, not on a stock sentence. */
  const audition = (character: string) => {
    if (!scene) return;
    if (auditioning === character) {
      tts.cancel();
      setAuditioning(null);
      return;
    }
    const line =
      scene.lines.find((l) => l.character_name === character && l.text.trim().length > 12) ??
      scene.lines.find((l) => l.character_name === character);
    const text = line?.text?.trim() || "Is all our company here?";
    setAuditioning(character);
    void tts.speak(text.slice(0, 220), fullVoices[character] ?? "coral");
  };

  const rehearse = useCallback(async () => {
    if (!scene || !mine || starting) return;
    setStarting(true);
    try {
      const { data } = await api.post<{ id: number } & Record<string, unknown>>(
        "/api/scenes/rehearse/start",
        { scene_id: scene.id, user_character: mine, user_characters: roles },
      );
      // The rehearsal page reads both of these to skip a round trip and to use
      // the voices chosen here rather than its own defaults.
      try {
        sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data));
        const withMeta: Record<string, { id: string; label: string; color: string }> = {};
        for (const [char, vid] of Object.entries(fullVoices)) {
          const v = voiceById(vid);
          withMeta[char] = { id: v.id, label: v.label, color: v.color };
        }
        sessionStorage.setItem(`actorrise_voice_map_${data.id}`, JSON.stringify(withMeta));
      } catch {
        /* quota — rehearsal falls back to fetching and to its own defaults */
      }
      const aiVoice = theirs[0] ? fullVoices[theirs[0]] : "coral";
      router.push(
        `/scenes/${scene.id}/rehearse?session=${data.id}&script=${scriptId}&voice=${aiVoice}`,
      );
    } catch (err: unknown) {
      setStarting(false);
      const up = parseUpgradeError(err);
      if (up) setUpgrade({ open: true, message: up.message });
      else toast.error(err instanceof Error ? err.message : "Couldn't start that run");
    }
  }, [scene, mine, roles, fullVoices, theirs, router, scriptId, starting]);

  const shell = `theatre-monologue theatre-tokens t-m__body ${theatreFontVars} min-h-screen pb-32`;
  const column = "mx-auto w-full max-w-[880px] px-5 pt-7 sm:px-6 sm:pt-10";

  if (isLoading || !scene) {
    return (
      <div className={shell}>
        <div className={column}>
          <Skeleton className="h-4 w-28 opacity-40" />
          <Skeleton className="mt-7 h-3 w-24 opacity-40" />
          <Skeleton className="mt-3 h-10 w-2/3 opacity-40" />
          <Skeleton className="mt-6 h-24 w-full rounded-2xl opacity-40" />
          <Skeleton className="mt-5 h-64 w-full rounded-lg opacity-40" />
        </div>
      </div>
    );
  }

  /* The top of the scene, which is what a preview is for. Enough to recognise
     it and to feel the temperature; not the whole thing, or this is the
     rehearsal page with the sound off. */
  const opening = scene.lines.slice(0, 6);
  const rest = Math.max(0, scene.line_count - opening.length);

  return (
    <div className={shell}>
      <div className={column}>
        <button
          type="button"
          onClick={() => router.push(`/practice?script=${scriptId}`)}
          className="t-mem__back"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          back to the script
        </button>

        {/* The head. */}
        <motion.header {...entrance(0, { reduce })} className="mt-7">
          <p className="t-m__dir m-0 text-[12px]" style={{ color: "var(--t-faint)" }}>
            {slugFor(scene)}
          </p>
          <h1 className="t-m__display m-0 mt-2 text-[34px] leading-[1.03] sm:text-[44px]">
            {scene.title}
          </h1>
          <p
            className="t-m__mono m-0 mt-2.5 text-[12px] uppercase tracking-[0.16em]"
            style={{ color: "var(--t-muted-dark-2)" }}
          >
            {[
              cast.slice(0, 2).join(" & "),
              `${scene.line_count} line${scene.line_count === 1 ? "" : "s"}`,
              formatSceneDuration(scene.estimated_duration_seconds),
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          {scene.description && (
            <p
              className="mt-4 max-w-[62ch] text-[15px] leading-relaxed"
              style={{ color: "var(--t-muted-dark)" }}
            >
              {scene.description}
            </p>
          )}
        </motion.header>

        {/* The two decisions. */}
        <motion.section {...entrance(1, { reduce })} className="mt-7">
          <div className="t-prev__casting">
            <div>
              <p className="t-prev__label">You play</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {cast.map((name) => {
                  const on = roles.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => chooseRole(name)}
                      aria-pressed={on}
                      className="t-prev__role"
                      data-on={on}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="t-prev__casting-rule" aria-hidden />

            <div>
              <p className="t-prev__label">I read</p>
              <div className="mt-2 flex flex-col gap-2">
                {theirs.length === 0 ? (
                  <p className="m-0 text-[13px]" style={{ color: "var(--t-faint)" }}>
                    Everyone in this scene is yours. Drop one to hear it read back.
                  </p>
                ) : (
                  theirs.map((name) => {
                    const v = voiceById(fullVoices[name]);
                    const busy = auditioning === name;
                    return (
                      <div key={name} className="flex flex-wrap items-center gap-2">
                        <span className="t-prev__them">{name}</span>
                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`Voice for ${name}`}
                            className="t-prev__voice"
                            value={v.id}
                            onChange={(e) => chooseVoice(name, e.target.value)}
                          >
                            {AI_VOICES.map((voice) => (
                              <option key={voice.id} value={voice.id}>
                                {voice.label} — {voice.desc}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => audition(name)}
                            className="t-prev__hear"
                            data-on={busy}
                            aria-label={busy ? `Stop ${name}` : `Hear ${name}`}
                          >
                            {busy ? (
                              <IconPlayerStopFilled className="h-3.5 w-3.5" />
                            ) : (
                              <IconVolume className="h-3.5 w-3.5" />
                            )}
                            {busy ? "stop" : "hear"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </motion.section>

        {/* The sides. */}
        <motion.section {...entrance(2, { reduce })} className="mt-7">
          <div className="t-prev__paper">
            <p className="t-prev__papertop">
              {scene.setting ? scene.setting : `${scene.play_title}${scene.play_author ? ` · ${scene.play_author}` : ""}`}
            </p>
            {opening.map((line, i) => {
              const isMine = roles.includes(line.character_name);
              return (
                <motion.div
                  key={line.id}
                  {...entrance(i, { reduce, y: 8, duration: 0.4 })}
                  className="t-prev__line"
                  data-mine={isMine}
                >
                  <p className="t-prev__who">
                    {line.character_name}
                    {isMine && <span className="t-prev__yours">you</span>}
                  </p>
                  {line.stage_direction && (
                    <p className="t-prev__dir">({line.stage_direction})</p>
                  )}
                  <p className="t-prev__text">{line.text}</p>
                </motion.div>
              );
            })}
            {rest > 0 && (
              <p className="t-prev__more">
                …and {rest} more line{rest === 1 ? "" : "s"}. The rest comes when you run it.
              </p>
            )}
          </div>
        </motion.section>
      </div>

      {/* The way on. Docked, so it is on screen however far down the sides you
          have read — this is the one thing the page is asking. */}
      <div className="t-prev__dock">
        <div className="t-prev__dockinner">
          <button
            type="button"
            onClick={rehearse}
            disabled={!mine || starting}
            className="t-prev__go"
          >
            {starting ? "Curtain up…" : "Rehearse this scene"}
            <span aria-hidden className="t-prev__godot">
              <IconPlayerPlay className="h-4 w-4 fill-current" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => router.push(`/practice/${scriptId}/scenes/${sceneId}/edit`)}
            className="t-prev__edit"
          >
            <IconPencil className="h-3.5 w-3.5" />
            edit the scene
          </button>
        </div>
      </div>

      <AnimatePresence>
        {upgrade.open && (
          <UpgradeModal
            open={upgrade.open}
            onOpenChange={(o) => setUpgrade((u) => ({ ...u, open: o }))}
            feature="ScenePartner"
            message={upgrade.message}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
