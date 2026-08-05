"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconLink,
  IconChevronLeft,
  IconChevronRight,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconLoader2,
} from "@tabler/icons-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCommunityScript, type RoomLine } from "@/hooks/useCommunityScript";
import { useRoomChannel } from "@/hooks/useRoomChannel";
import { useRoomVoice } from "@/hooks/useRoomVoice";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MicWaveform } from "@/components/scenepartner/MicWaveform";

const normWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/** How many leading words of a line the spoken transcript has covered (sequential,
 *  lightly fuzzy) — drives the live word-highlight as you say your line. */
function matchedWordCount(lineWords: string[], transcript: string): number {
  const spoken = transcript.split(/\s+/).map(normWord).filter(Boolean);
  let cursor = 0;
  let matched = 0;
  for (const lw of lineWords) {
    const n = normWord(lw);
    if (!n) {
      matched++;
      continue;
    }
    let found = -1;
    for (let i = cursor; i < spoken.length; i++) {
      const s = spoken[i];
      if (s === n || (n.length >= 4 && s.length >= 4 && s.slice(0, 4) === n.slice(0, 4))) {
        found = i;
        break;
      }
    }
    if (found === -1) break;
    cursor = found + 1;
    matched++;
  }
  return matched;
}

export function RehearsalRoom({ roomId, scriptId }: { roomId: string; scriptId: number }) {
  const { user } = useAuth();
  const myName = (user?.name?.trim().split(/\s+/)[0]) || "Actor";
  const { data: script, isLoading } = useCommunityScript(scriptId);
  const {
    myId,
    participants,
    sceneIndex,
    setScene,
    currentLine,
    setLine,
    myRole,
    claimRole,
    connected,
    sceneEdits,
    setSceneLines,
  } = useRoomChannel(roomId, myName);
  const voice = useRoomVoice(roomId, myName);
  const sr = useSpeechRecognition({ continuous: true, interimResults: true });
  const [editMode, setEditMode] = useState(false);

  // The stage door. Browsers only hand over a mic on a user gesture, so a tap
  // is unavoidable — this makes the one tap BE entering the room, instead of a
  // separate "Voice" toggle in the corner that a partner never notices.
  const [entered, setEntered] = useState(false);
  const [entering, setEntering] = useState(false);

  // Which line is live, and is it mine? (computed from raw state so it's
  // available before the loading early-return, keeping hook order stable.)
  const curScene = script?.scenes?.[Math.min(sceneIndex, (script?.scenes?.length ?? 1) - 1)];
  const curLines = sceneEdits[sceneIndex] ?? curScene?.lines;
  const curLine = curLines?.[Math.min(currentLine, (curLines?.length ?? 1) - 1)];
  const isMyLine =
    !!myRole && !!curLine && curLine.character_name.toUpperCase() === myRole.toUpperCase();

  // Listen while it's my line so the words light up as I say them.
  useEffect(() => {
    if (isMyLine && sr.isSupported) {
      sr.resetTranscript();
      sr.startListening();
    } else {
      sr.stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyLine, currentLine, sceneIndex]);

  // Gate first paint so server and first client render agree (React Query cache
  // can be warm on the client, empty on the server) — avoids a hydration flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);


  // Once a partner joins, post ONE "rehearsing together" beat to the Callboard.
  // Only the lowest-id participant posts, so a room yields a single event.
  const postedRef = useRef(false);
  useEffect(() => {
    if (postedRef.current || participants.length < 2) return;
    const ids = participants.map((p) => p.id).sort();
    if (ids[0] !== myId) return;
    const title = script?.scenes?.[Math.min(sceneIndex, (script.scenes.length || 1) - 1)]?.title;
    if (!title) return;
    postedRef.current = true;
    api.post("/api/community/room-activity", { title }).catch(() => {});
  }, [participants, myId, script, sceneIndex]);

  if (!mounted || isLoading || !script) return <RoomSkeleton />;
  const scenes = script.scenes;
  if (scenes.length === 0) {
    return <Centered>This script has no scenes to rehearse yet.</Centered>;
  }

  const scene = scenes[Math.min(sceneIndex, scenes.length - 1)] ?? scenes[0];
  const roles = [scene.character_1_name, scene.character_2_name];
  // Effective (possibly edited) lines — session-only, synced, never saved.
  const lines = sceneEdits[sceneIndex] ?? scene.lines;
  const lineCount = Math.max(1, lines.length);
  const at = Math.min(currentLine, lineCount - 1);
  const updateLines = (next: RoomLine[]) => setSceneLines(sceneIndex, next);

  const takenBy = (role: string) => participants.find((p) => p.role === role);

  if (!entered) {
    return (
      <StageDoor
        scriptTitle={script.title}
        sceneTitle={scene.title}
        others={participants.filter((p) => p.id !== myId)}
        entering={entering}
        error={voice.error}
        onEnter={async (withVoice) => {
          if (!withVoice) {
            setEntered(true);
            return;
          }
          setEntering(true);
          // Mic refused? Still go in — being in the room without voice beats
          // being stuck at the door.
          await voice.join();
          setEntering(false);
          setEntered(true);
        }}
      />
    );
  }

  return (
    <div className="dark min-h-screen bg-[#191410] text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        {/* top bar */}
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            href="/greenroom"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-100"
          >
            <IconArrowLeft className="h-4 w-4" /> Green Room
          </Link>
          <div className="flex items-center gap-3">
            <Presence participants={participants} connected={connected} />
            <VoiceControl voice={voice} />
            <InviteButton roomId={roomId} scriptId={scriptId} sceneTitle={scene.title} />
          </div>
        </div>

        {/* scene header */}
        <header className="mb-8">
          <p className="font-typewriter text-xs italic tracking-wide text-neutral-500">
            (in the room.)
          </p>
          <h1 className="mt-1.5 text-2xl font-bold uppercase tracking-wider text-neutral-50 sm:text-3xl">
            {scene.title}
          </h1>
          <p className="mt-2 font-typewriter text-xs text-neutral-500">
            {script.title} · shared by {script.owner_name}
          </p>
          {scenes.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {scenes.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScene(i)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    i === sceneIndex
                      ? "border-transparent bg-[#CB4B00] text-white"
                      : "border-neutral-700 text-neutral-400 hover:text-neutral-100"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* role claim */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          {roles.map((role) => {
            const holder = takenBy(role);
            const mine = myRole === role;
            const takenByOther = holder && !mine;
            return (
              <button
                key={role}
                type="button"
                onClick={() => claimRole(mine ? null : role)}
                disabled={!!takenByOther}
                className={`flex flex-col items-start border p-3.5 text-left transition-colors ${
                  mine
                    ? "border-[#CB4B00] bg-[#CB4B00]/10"
                    : takenByOther
                      ? "cursor-not-allowed border-neutral-800 opacity-60"
                      : "border-neutral-700 hover:border-[#CB4B00]/50"
                }`}
              >
                <span className="font-typewriter text-sm font-semibold uppercase tracking-wider text-neutral-100">
                  {role}
                </span>
                <span className="mt-0.5 text-xs text-neutral-500">
                  {mine ? "You" : holder ? holder.name : "Claim"}
                </span>
              </button>
            );
          })}
        </div>

        {/* who's here */}
        {participants.length > 1 && (
          <div className="mb-5 flex items-center gap-2">
            {participants.map((p) => (
              <span
                key={p.id}
                title={`${p.name}${p.role ? ` · ${p.role}` : ""}`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#CB4B00] to-[#B03000] text-xs font-semibold text-white ring-1 ring-[#CB4B00]/30"
              >
                {(p.name?.[0] || "?").toUpperCase()}
              </span>
            ))}
            <span className="ml-1 text-xs text-neutral-500">in the room</span>
          </div>
        )}

        {/* edit toggle + script */}
        <div className="mb-2.5 flex justify-end">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              editMode
                ? "border-transparent bg-[#CB4B00] text-white"
                : "border-neutral-700 text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {editMode ? "Done editing" : "Edit lines"}
          </button>
        </div>
        <ScriptView
          lines={lines}
          at={at}
          myRole={myRole}
          transcript={sr.transcript}
          listening={isMyLine && sr.isListening}
          editMode={editMode}
          roles={roles}
          onChange={updateLines}
        />

        {/* line controls — the floating pill from the rehearsal screen */}
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-orange-500/40 bg-neutral-900/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setLine(Math.max(0, at - 1))}
            disabled={at <= 0}
            aria-label="Previous line"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-30"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-typewriter text-xs tabular-nums text-neutral-400">
            {at + 1} / {lineCount}
          </span>
          <button
            type="button"
            onClick={() => setLine(Math.min(lineCount - 1, at + 1))}
            disabled={at >= lineCount - 1}
            className="inline-flex items-center gap-1 rounded-full bg-[#CB4B00] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#B03000] disabled:opacity-40"
          >
            Next <IconChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* voice status — only when there's something worth saying */}
        {(voice.error || (voice.joined && voice.peers.length === 0)) && (
          <p className="mt-6 text-center font-typewriter text-xs text-neutral-500">
            {voice.error ? (
              <span className="text-red-400">{voice.error}</span>
            ) : (
              "Waiting for your partner to join the call…"
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The moment before you walk on. One tap takes the mic, joins voice, and puts
 * you in the room already connected — both actors pass through the same door,
 * so neither can miss the step that makes them audible.
 */
function StageDoor({
  scriptTitle,
  sceneTitle,
  others,
  entering,
  error,
  onEnter,
}: {
  scriptTitle: string;
  sceneTitle: string;
  others: { id: string; name: string }[];
  entering: boolean;
  error: string | null;
  onEnter: (withVoice: boolean) => void;
}) {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#191410] px-4 text-neutral-100">
      <div className="w-full max-w-md text-center">
        <p className="font-typewriter text-xs italic tracking-wide text-neutral-500">
          (places, please.)
        </p>

        <h1 className="mt-4 text-2xl font-bold uppercase leading-tight tracking-wider text-neutral-50 sm:text-3xl">
          {sceneTitle}
        </h1>
        <p className="mt-2 font-typewriter text-xs text-neutral-500">{scriptTitle}</p>

        <div className="mt-8 flex min-h-[1.5rem] items-center justify-center gap-2">
          {others.length > 0 ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="font-typewriter text-sm text-neutral-300">
                {others.length === 1
                  ? `${others[0].name} is already here`
                  : `${others.length} actors are already here`}
              </span>
            </>
          ) : (
            <span className="font-typewriter text-sm text-neutral-500">
              Nobody else yet. Send them the link.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onEnter(true)}
          disabled={entering}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#CB4B00] px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-[#B03000] disabled:opacity-60"
        >
          {entering ? (
            <IconLoader2 className="h-5 w-5 animate-spin" />
          ) : (
            <IconMicrophone className="h-5 w-5" />
          )}
          {entering ? "Going in" : "Go in"}
        </button>
        <p className="mt-2.5 font-typewriter text-xs text-neutral-500">uses your mic</p>

        {error && <p className="mt-4 font-typewriter text-xs text-red-400">{error}</p>}

        <button
          type="button"
          onClick={() => onEnter(false)}
          className="mt-6 font-typewriter text-xs text-neutral-500 underline underline-offset-4 transition-colors hover:text-neutral-200"
        >
          or go in without voice
        </button>
      </div>
    </div>
  );
}

function InviteButton({
  roomId,
  scriptId,
  sceneTitle,
}: {
  roomId: string;
  scriptId: number;
  sceneTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Room link copied — send it to your partner.");
    } catch {
      toast.error("Couldn't copy — grab the URL from the address bar.");
    }
  };

  const sendInvite = async () => {
    const to = email.trim();
    if (!to) return;
    setSending(true);
    try {
      const res = await api.post<{ sent: boolean; reason?: string }>(
        "/api/community/room-invite",
        { email: to, room_id: roomId, script_id: scriptId, scene_title: sceneTitle }
      );
      if (res.data?.sent) {
        toast.success(`Invite sent to ${to}`);
        setEmail("");
        setOpen(false);
      } else {
        toast.error("Couldn't email that. Copy the link and send it yourself.");
      }
    } catch {
      toast.error("Couldn't email that. Copy the link and send it yourself.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#CB4B00] px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#B03000]"
      >
        <IconLink className="h-4 w-4" /> Invite
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
          <p className="text-sm font-medium text-neutral-100">Invite your partner</p>
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendInvite()}
              placeholder="friend@email.com"
              className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-transparent px-2.5 py-1.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#CB4B00]/60"
            />
            <button
              type="button"
              onClick={sendInvite}
              disabled={sending || !email.trim()}
              className="shrink-0 rounded-md bg-[#CB4B00] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#B03000] disabled:opacity-50"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="mt-3 w-full text-center text-xs text-neutral-500 transition-colors hover:text-neutral-100"
          >
            or copy the room link
          </button>
        </div>
      )}
    </div>
  );
}

function VoiceControl({ voice }: { voice: ReturnType<typeof useRoomVoice> }) {
  const { joined, joining, muted, peers, error, join, leave, toggleMute } = voice;

  if (!joined) {
    return (
      <button
        type="button"
        onClick={join}
        disabled={joining}
        title={error ?? "Rehearse out loud together"}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-[#CB4B00]/50 disabled:opacity-60"
      >
        {joining ? (
          <IconLoader2 className="h-4 w-4 animate-spin" />
        ) : (
          <IconMicrophone className="h-4 w-4" />
        )}
        {joining ? "Joining" : "Voice"}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-1">
      <button
        type="button"
        onClick={toggleMute}
        title={muted ? "Unmute" : "Mute"}
        className={`flex h-7 w-7 items-center justify-center rounded-full ${
          muted ? "text-red-400" : "text-amber-400"
        }`}
      >
        {muted ? <IconMicrophoneOff className="h-4 w-4" /> : <IconMicrophone className="h-4 w-4" />}
      </button>
      <span className="px-1 text-xs text-neutral-400">{peers.length > 0 ? "on" : "…"}</span>
      <button
        type="button"
        onClick={leave}
        title="Leave voice"
        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-red-400"
      >
        <IconPhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

function ScriptView({
  lines,
  at,
  myRole,
  transcript,
  listening,
  editMode,
  roles,
  onChange,
}: {
  lines: RoomLine[];
  at: number;
  myRole: string | null;
  transcript: string;
  listening: boolean;
  editMode: boolean;
  roles: string[];
  onChange: (next: RoomLine[]) => void;
}) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!editMode) activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [at, editMode]);

  if (editMode) {
    return <EditableScript lines={lines} roles={roles} onChange={onChange} />;
  }

  // Warm reading canvas — dark ink + orange highlights read best on cream,
  // matching the solo rehearsal design. The glow is the page catching the light.
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#faf7f1] p-5 shadow-[0_18px_60px_-18px_rgba(203,75,0,0.55),0_6px_24px_-8px_rgba(0,0,0,0.7)] sm:p-7">
      <div className="space-y-5">
        {lines.map((ln, i) => {
          const active = i === at;
          const mine = !!myRole && ln.character_name.toUpperCase() === myRole.toUpperCase();
          return (
            <div key={i} ref={active ? activeRef : undefined}>
              <p
                className={`font-typewriter text-[11px] font-semibold uppercase tracking-wider ${
                  mine ? "text-[#CB4B00]" : "text-neutral-400"
                }`}
              >
                {ln.character_name}
                {mine ? " · you" : ""}
              </p>
              <p
                className={`mt-1 font-typewriter text-[16px] leading-relaxed ${
                  active ? "text-neutral-900" : "text-neutral-400"
                }`}
              >
                {active && mine && listening ? (
                  <LiveLine text={ln.text} transcript={transcript} />
                ) : (
                  ln.text
                )}
              </p>
              {active && mine && listening && (
                <div className="mt-2">
                  <MicWaveform active className="h-6 w-32" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Session-only line editing, synced live to your partner (fix wording, reassign
 *  a line to the other role, add/remove). Never saved to the source script. */
function EditableScript({
  lines,
  roles,
  onChange,
}: {
  lines: RoomLine[];
  roles: string[];
  onChange: (next: RoomLine[]) => void;
}) {
  const patch = (i: number, p: Partial<RoomLine>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...lines,
      { line_order: (lines[lines.length - 1]?.line_order ?? -1) + 1, character_name: roles[0], text: "" },
    ]);

  return (
    <div className="rounded-2xl border border-black/5 bg-[#faf7f1] p-4 shadow-[0_18px_60px_-18px_rgba(203,75,0,0.55),0_6px_24px_-8px_rgba(0,0,0,0.7)] sm:p-5">
      <p className="mb-3 text-xs text-neutral-500">
        Just for this rehearsal, synced to your partner. The original isn&apos;t changed.
      </p>
      <div className="space-y-2.5">
        {lines.map((ln, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex shrink-0 overflow-hidden rounded-md border border-neutral-300">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => patch(i, { character_name: r })}
                  title={r}
                  className={`whitespace-nowrap px-2 py-1 font-typewriter text-[10px] font-semibold uppercase ${
                    ln.character_name.toUpperCase() === r.toUpperCase()
                      ? "bg-[#CB4B00] text-white"
                      : "bg-white text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={ln.text}
              onChange={(e) => patch(i, { text: e.target.value })}
              rows={1}
              className="min-w-0 flex-1 resize-none rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 font-typewriter text-sm text-neutral-900 outline-none focus:border-[#CB4B00]"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Delete line"
              className="shrink-0 rounded-md px-2 py-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-red-600"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-3 rounded-full border border-neutral-300 px-3 py-1 font-typewriter text-xs text-neutral-600 hover:border-[#CB4B00] hover:text-[#CB4B00]"
      >
        + add line
      </button>
    </div>
  );
}

/** The active line, with each word lighting up (orange) as it's spoken. */
function LiveLine({ text, transcript }: { text: string; transcript: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const matched = matchedWordCount(words, transcript);
  const tokens = text.split(/(\s+)/); // keep whitespace tokens
  let wi = 0;
  return (
    <>
      {tokens.map((tok, i) => {
        if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>;
        const idx = wi++;
        return (
          <span key={i} className={idx < matched ? "text-[#CB4B00]" : "text-neutral-400"}>
            {tok}
          </span>
        );
      })}
    </>
  );
}

function Presence({
  participants,
  connected,
}: {
  participants: { id: string; name: string }[];
  connected: boolean;
}) {
  const n = participants.length;
  return (
    <div className="flex items-center gap-2" title={participants.map((p) => p.name).join(", ")}>
      <span className="relative flex h-2 w-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-amber-400" : "bg-neutral-600"}`}
        />
      </span>
      <span className="hidden text-sm text-neutral-400 sm:inline">
        {n <= 1 ? "just you" : `${n} here`}
      </span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-[#191410]">
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-neutral-400">
        {children}
      </div>
    </div>
  );
}

function RoomSkeleton() {
  return (
    <div className="dark min-h-screen bg-[#191410]">
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <div className="mb-8 h-9 w-56 animate-pulse rounded bg-neutral-800" />
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="h-16 animate-pulse border border-neutral-800 bg-neutral-800/50" />
          <div className="h-16 animate-pulse border border-neutral-800 bg-neutral-800/50" />
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-neutral-800/50" />
      </div>
    </div>
  );
}
