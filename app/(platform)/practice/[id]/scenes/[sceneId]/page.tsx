"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { castPalette, castColorVars } from "@/lib/castColors";
import { VoiceMark } from "@/components/scenepartner/VoiceMark";
import { VoicePicker } from "@/components/scenepartner/VoicePicker";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { motion, useReducedMotion } from "framer-motion";
import {
  IconArrowLeft,
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
  REHEARSAL_VOICES,
  defaultRehearsalVoices,
  getCharacterNotes,
  getCharacterVoices,
  getMyRoles,
  setCharacterNote,
  setCharacterVoices,
  setMyRoles,
  voiceSample,
  type CharacterVoices,
} from "@/lib/scenePrefs";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";
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
 * This is the preview. It answers the three questions you actually have
 * standing in front of a scene — what is this, who am I, what do the others
 * sound like — and then has one loud way on. It is sides: the scene's own
 * head, the cast, and the dialogue set on paper.
 *
 * This is where the actor casts: the part, and the voice for every other part,
 * from the ten the rehearsal reads with (GET /api/rehearsal/scenes/{id}/voices,
 * the server's own list and its defaults; lib/scenePrefs REHEARSAL_VOICES
 * until that answers). "hear" plays a few seconds of the voice, a static file.
 * Each part can take a note of the actor's own ("meaner"): Plus, locked with
 * the Plus mark for a free account.
 * Both are remembered, and "Rehearse this scene" goes straight into the run
 * (`?go=1`) with no Curtain in between. The part is required, because it is
 * the one thing the run cannot guess; an untouched voice is the server's own
 * default, which is what the picker shows.
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
  character_1_gender?: string | null;
  character_2_gender?: string | null;
  setting: string | null;
  tone: string | null;
  line_count: number;
  estimated_duration_seconds: number;
  rehearsal_count: number;
  lines: SceneLine[];
  /** False on a teacher's scene a student opened from their class shelf. */
  can_edit?: boolean;
}

/** GET /api/rehearsal/scenes/{id}/voices */
interface SceneVoices {
  voices: { id: string; label: string; gender: string; sample?: string | null }[];
  /** {the actor's part: {partner: voice id}} */
  defaults: Record<string, Record<string, string>>;
  can_direct: boolean;
  note_max: number;
}

const FALLBACK_VOICES: SceneVoices["voices"] = [...REHEARSAL_VOICES];

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
  // The voices and the defaults the run will use. The defaults come from the
  // character reading on the server, so they cannot be worked out here.
  const { data: castInfo } = useSWR<SceneVoices>(
    Number.isFinite(sceneId) ? `/api/rehearsal/scenes/${sceneId}/voices` : null,
    () => api.get<SceneVoices>(`/api/rehearsal/scenes/${sceneId}/voices`).then((r) => r.data),
    { revalidateOnFocus: false },
  );
  const voiceList = castInfo?.voices ?? FALLBACK_VOICES;

  /* Overrides, not state-of-record. Both of these are DERIVED from storage and
     only replaced once the actor touches them — an effect that seeded state
     after mount would be a setState in an effect, which is the cascading render
     this repo's React rules reject, and it would also flash the default role for
     a frame before the saved one landed. Nothing here is read until `scene`
     exists, which only happens client-side, so there is no snapshot to
     mismatch on hydration. */
  const [rolesPicked, setRolesPicked] = useState<string[] | null>(null);
  const [voicesPicked, setVoicesPicked] = useState<CharacterVoices | null>(null);
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /* Fixing a line where you read it. Deliberately small: across the whole
     library exactly 4 scenes have ever had their text changed, 3 a character
     renamed. This does not need undo, reorder or bulk-reset -- it needs to not
     make you leave the page to correct a typo. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ who: string; text: string }>({ who: "", text: "" });
  const [savingLine, setSavingLine] = useState(false);

  const sampleRef = useRef<HTMLAudioElement | null>(null);
  const stopSample = useCallback(() => {
    sampleRef.current?.pause();
    sampleRef.current = null;
    setAuditioning(null);
  }, []);
  const [notesPicked, setNotesPicked] = useState<Record<string, string> | null>(null);
  const [asking, setAsking] = useState(false);

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

  /* What the actor decided last time. No fallback to the first part: the part
     is the one thing the run cannot guess, so until one is chosen nothing is
     marked "you" and the way on stays shut. */
  const roles = useMemo(() => {
    if (rolesPicked) return rolesPicked;
    if (!scene || cast.length === 0) return [];
    return getMyRoles(scene.id).filter((r) => cast.includes(r));
  }, [rolesPicked, scene, cast]);

  const mine = roles[0] ?? "";

  const saved = useMemo(
    () => voicesPicked ?? (scene ? getCharacterVoices(scene.id) : {}),
    [voicesPicked, scene],
  );
  /* The parts someone else reads, in order of appearance, each with the voice
     the run will use: the actor's pick when it is one of the four, else the
     server's default for that part. */
  const theirs = useMemo(() => cast.filter((c) => !roles.includes(c)), [cast, roles]);
  const fullVoices = useMemo(() => {
    if (!scene) return {} as Record<string, string>;
    const genderOf = (n: string) =>
      n === scene.character_1_name ? scene.character_1_gender
        : n === scene.character_2_name ? scene.character_2_gender
          : null;
    const server = castInfo?.defaults[mine];
    const out = server ? { ...server } : defaultRehearsalVoices(theirs, genderOf);
    for (const name of theirs) {
      const pick = saved[name];
      if (pick && voiceList.some((v) => v.id === pick)) out[name] = pick;
    }
    return out;
  }, [scene, theirs, saved, castInfo, mine, voiceList]);
  const notes = useMemo(
    () => notesPicked ?? (scene ? getCharacterNotes(scene.id) : {}),
    [notesPicked, scene],
  );
  const writeNote = (character: string, note: string) => {
    if (!scene) return;
    setNotesPicked({ ...notes, [character]: note });
    setCharacterNote(scene.id, character, note);
  };

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

  /* Only the parts the actor touched are written, so an untouched one keeps
     following the server's default. */
  const chooseVoice = (character: string, voiceId: string) => {
    if (!scene) return;
    const next = { ...saved, [character]: voiceId };
    setVoicesPicked(next);
    setCharacterVoices(scene.id, next);
  };

  /** Hear a few seconds of the voice: one sample per voice, made once and
      shipped in /public, so trying all ten costs nothing. It used to speak a
      real line through the OpenAI voice, which the partner no longer uses. */
  const audition = (character: string) => {
    if (auditioning === character) {
      stopSample();
      return;
    }
    stopSample();
    const id = fullVoices[character];
    if (!id) return;
    const src = voiceList.find((v) => v.id === id)?.sample ?? voiceSample(id);
    const audio = new Audio(src);
    sampleRef.current = audio;
    setAuditioning(character);
    audio.onended = () => setAuditioning((a) => (a === character ? null : a));
    audio.play().catch(() => setAuditioning(null));
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

  /* Cast here, so straight in: `?go=1` tells the rehearse screen to skip the
     Curtain and open the run on the saved part and voices. It still holds the
     Plus gate, and falls back to the Curtain when it must. */
  const rehearse = useCallback(() => {
    if (!scene || !mine || starting) return;
    stopSample();
    setStarting(true);
    router.push(`/scenes/${scene.id}/rehearse?go=1`);
  }, [scene, mine, router, starting, stopSample]);

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
          onClick={() =>
            router.push(scene.can_edit === false ? "/practice" : `/practice?script=${scriptId}`)
          }
          className="t-mem__back"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          {scene.can_edit === false ? "back to the shelf" : "back to the script"}
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

        {/* The casting: your part, and who reads the others. */}
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
              <div className="t-prev__castlist mt-2">
                {!mine ? (
                  <p className="m-0 text-[13px]" style={{ color: "var(--t-faint)" }}>
                    Pick your part and I read the rest.
                  </p>
                ) : theirs.length === 0 ? (
                  <p className="m-0 text-[13px]" style={{ color: "var(--t-faint)" }}>
                    Everyone in this scene is yours.
                  </p>
                ) : (
                  theirs.map((name) => {
                    const voiceId = fullVoices[name];
                    const busy = auditioning === name;
                    return (
                      <div
                        key={name}
                        className="t-prev__castrow"
                        style={castColorVars(name, palette)}
                      >
                        <span className="t-prev__who-cell">
                          <span className="t-prev__voicemark" aria-hidden>
                            <VoiceMark voiceId={voiceId} size={15} />
                          </span>
                          <span className="t-prev__them">{name}</span>
                        </span>
                        <VoicePicker
                          character={name}
                          voices={voiceList}
                          value={voiceId}
                          onChange={(id) => chooseVoice(name, id)}
                          sampleFor={(v) => v.sample ?? voiceSample(v.id)}
                          scopeClassName={`theatre-monologue theatre-tokens ${theatreFontVars}`}
                        />
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
                        {/* A note for the part, across the whole row. Plus:
                            a free account sees it locked, and a tap opens the
                            plans (the server drops the note either way). */}
                        {castInfo?.can_direct ? (
                          <input
                            type="text"
                            value={notes[name] ?? ""}
                            maxLength={castInfo.note_max}
                            onChange={(e) => writeNote(name, e.target.value)}
                            aria-label={`A note for ${name}`}
                            placeholder={`A note for ${name}, like "meaner"`}
                            className="col-span-full -mt-1 min-h-9 w-full border-0 border-b border-dashed bg-transparent text-[13px] outline-none"
                            style={{ borderColor: "var(--t-line-light)", color: "var(--t-text)" }}
                          />
                        ) : castInfo ? (
                          <button
                            type="button"
                            onClick={() => setAsking(true)}
                            aria-disabled
                            className="col-span-full -mt-1 flex min-h-9 items-center text-left text-[13px]"
                            style={{ color: "var(--t-faint)" }}
                          >
                            A note for {name}, like &quot;meaner&quot;
                            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">Plus</span>
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <MonologuePaywallModal
            open={asking}
            onOpenChange={setAsking}
            feature="partner_direction"
            title="Directing your partner is a Plus thing."
            description="With Plus you can give each part a note, like meaner, slower or drunker, and the partner reads it that way. Free to start, card on file, cancel before it renews."
          />
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
                        {/* The voice that reads this part, so two parts handed
                            the same one show it on the page. */}
                        {!isMine && mine && fullVoices[line.character_name] && (
                          <span className="t-prev__chip">
                            <VoiceMark
                              voiceId={fullVoices[line.character_name]}
                              label={voiceList.find((v) => v.id === fullVoices[line.character_name])?.label}
                              size={13}
                            />
                          </span>
                        )}
                        <span className="t-prev__name">{line.character_name}</span>
                        {isMine && <span className="t-prev__yours">you</span>}
                        {/* Fix it where you read it. The editor was the only
                            way to correct a typo and it cost a full page. */}
                        {scene.can_edit !== false && (
                          <button
                            type="button"
                            onClick={() => beginEdit(line)}
                            aria-label={`Edit ${line.character_name}'s line`}
                            className="t-prev__lineedit"
                          >
                            edit
                          </button>
                        )}
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
            {starting ? "Curtain up…" : mine ? "Rehearse this scene" : "Pick your part"}
            <span aria-hidden className="t-prev__godot">
              <IconPlayerPlay className="h-4 w-4 fill-current" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
