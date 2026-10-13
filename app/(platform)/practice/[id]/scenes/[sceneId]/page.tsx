"use client";

import { useCallback, useMemo, useState } from "react";
import { castPalette, castColorVars } from "@/lib/castColors";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { motion, useReducedMotion } from "framer-motion";
import { IconArrowLeft, IconPlayerPlay } from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { entrance } from "@/lib/motion";
import { formatSceneDuration } from "@/lib/scenes";
import { getMyRoles, setMyRoles } from "@/lib/scenePrefs";
import { ScenePreviewSkeleton } from "@/components/practice/ScenePreviewSkeleton";

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
 * This is the preview. It answers the two questions you actually have
 * standing in front of a scene — what is this, who am I — and then has one
 * loud way on. It is sides: the scene's own head, the cast, and the dialogue
 * set on paper.
 *
 * Everything editable is still there, one tap away under "edit the scene". The
 * one decision that belongs to rehearsing rather than editing — which part is
 * yours — is made HERE and remembered, so the Curtain opens on it. The voices
 * are chosen at the Curtain, the one place that picks them; a second picker
 * here showed a voice the run might not use.
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

  const { data: scene, isLoading, mutate } = useSWR<SceneDetail>(
    Number.isFinite(sceneId) ? `/api/scenes/${sceneId}` : null,
    () => api.get<SceneDetail>(`/api/scenes/${sceneId}`).then((r) => r.data),
    { revalidateOnFocus: false },
  );

  /* An override, not state-of-record. It is DERIVED from storage and only
     replaced once the actor touches it — an effect that seeded state after
     mount would be a setState in an effect, which is the cascading render this
     repo's React rules reject, and it would also flash the default role for a
     frame before the saved one landed. Nothing here is read until `scene`
     exists, which only happens client-side, so there is no snapshot to
     mismatch on hydration. */
  const [rolesPicked, setRolesPicked] = useState<string[] | null>(null);
  const [starting, setStarting] = useState(false);
  /* Fixing a line where you read it. Deliberately small: across the whole
     library exactly 4 scenes have ever had their text changed, 3 a character
     renamed. This does not need undo, reorder or bulk-reset -- it needs to not
     make you leave the page to correct a typo. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ who: string; text: string }>({ who: "", text: "" });
  const [savingLine, setSavingLine] = useState(false);

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

  const mine = roles[0] ?? "";

  /* A colour per character, dealt in order of appearance.
     A scene is a wall of identical monospace with a name over every
     paragraph, so finding your own cue means reading every name. An actor
     works off a page of sides by flicking down the left edge. The rehearsal
     screen already drew a coloured initial per character; the page where the
     actor actually READS had nothing. See lib/castColors. */
  const palette = useMemo(
    () => castPalette((scene?.lines ?? []).map((l) => l.character_name)),
    [scene?.lines],
  );

  const chooseRole = (name: string) => {
    if (!scene) return;
    const next = [name];
    setRolesPicked(next);
    setMyRoles(scene.id, next);
  };

  const beginEdit = (line: { id: number; character_name: string; text: string }) => {
    setEditingId(line.id);
    setDraft({ who: line.character_name, text: line.text });
  };

  const saveLine = useCallback(async () => {
    if (editingId == null || savingLine) return;
    setSavingLine(true);
    try {
      await api.put(
        `/api/scripts/${scriptId}/scenes/${sceneId}/lines/${editingId}`,
        { character_name: draft.who.trim(), text: draft.text.trim() },
      );
      // Refetch rather than patch in place: the server owns line_order and the
      // word counts that drive the duration under the title.
      await mutate();
      setEditingId(null);
    } catch {
      toast.error("Could not save that line.");
    } finally {
      setSavingLine(false);
    }
  }, [editingId, savingLine, scriptId, sceneId, draft, mutate]);

  /* The rehearse screen opens its own run, holds the Plus gate and asks who
     you are at the curtain; this page only walks you to the door. */
  const rehearse = useCallback(() => {
    if (!scene || !mine || starting) return;
    setStarting(true);
    router.push(`/scenes/${scene.id}/rehearse`);
  }, [scene, mine, router, starting]);

  const shell = `theatre-monologue theatre-tokens t-m__body ${theatreFontVars} min-h-screen pb-32`;
  const column = "mx-auto w-full max-w-[880px] px-5 pt-7 sm:px-6 sm:pt-10";

  /* The same skeleton loading.tsx renders, not a second one shaped slightly
     differently. Opening a scene used to show a skeleton, then a DIFFERENT
     skeleton, then the sides. */
  if (isLoading || !scene) return <ScenePreviewSkeleton />;

  /* The top of the scene, which is what a preview is for. Enough to recognise
     it and to feel the temperature; not the whole thing, or this is the
     rehearsal page with the sound off. */
  /* The whole scene, not the first six lines.
     36 people opened the 4,018-line editor and 4 of them changed anything: 32
     of 36 edit snapshots are identical to the scene as extracted. They were not
     repairing it, they were READING it, because this page only ever showed six
     lines and the editor was the only place the rest of the script existed.
     Showing it here is what those visits were for, and it retires the
     role-aware excerpt problem outright: there is no excerpt left to miss your
     character's lines. */
  const sides = scene.lines;

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

        {/* The one decision. The voices are the Curtain's. */}
        <motion.section {...entrance(1, { reduce })} className="mt-7">
          <div className="t-prev__casting t-prev__casting--solo">
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
          </div>
        </motion.section>

        {/* The sides. */}
        <motion.section {...entrance(2, { reduce })} className="mt-7">
          <div className="t-prev__paper">
            <p className="t-prev__papertop">
              {scene.setting ? scene.setting : `${scene.play_title}${scene.play_author ? ` · ${scene.play_author}` : ""}`}
            </p>
            {sides.map((line, i) => {
              const isMine = roles.includes(line.character_name);
              return (
                <motion.div
                  key={line.id}
                  /* Only the top of the scene arrives. The longest scene in
                     the library is 106 lines; animating all of them costs a
                     hundred transforms to decorate text nobody can see yet. */
                  {...(i < 8 ? entrance(i, { reduce, y: 8, duration: 0.4 }) : {})}
                  className="t-prev__line"
                  data-mine={isMine}
                >
                  {editingId === line.id ? (
                    <div className="space-y-2">
                      <input
                        value={draft.who}
                        onChange={(e) => setDraft((d) => ({ ...d, who: e.target.value }))}
                        aria-label="Character name"
                        className="w-full max-w-[22ch] rounded border border-border bg-background px-2 py-1 text-xs uppercase tracking-[0.14em]"
                      />
                      <textarea
                        value={draft.text}
                        onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                        aria-label="Line"
                        rows={Math.min(18, Math.max(2, Math.ceil(draft.text.length / 60)))}
                        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm leading-relaxed"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={saveLine}
                          disabled={savingLine || !draft.text.trim()}
                          className="rounded-md bg-primary px-3 h-8 text-xs font-medium text-primary-foreground disabled:opacity-60"
                        >
                          {savingLine ? "saving…" : "save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="t-prev__who" style={castColorVars(line.character_name, palette)}>
                        <span className="t-prev__name">{line.character_name}</span>
                        {isMine && <span className="t-prev__yours">you</span>}
                        {/* Fix it where you read it. The editor was the only
                            way to correct a typo and it cost a full page. */}
                        <button
                          type="button"
                          onClick={() => beginEdit(line)}
                          aria-label={`Edit ${line.character_name}'s line`}
                          className="t-prev__lineedit"
                        >
                          edit
                        </button>
                      </p>
                      {line.stage_direction && (
                        <p className="t-prev__dir">({line.stage_direction})</p>
                      )}
                      <p className="t-prev__text">{line.text}</p>
                    </>
                  )}
                </motion.div>
              );
            })}
            <p className="t-prev__more">
              (end of the scene.)
            </p>
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
        </div>
      </div>
    </div>
  );
}
