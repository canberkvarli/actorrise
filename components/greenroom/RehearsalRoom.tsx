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
import { useCommunityScript } from "@/hooks/useCommunityScript";
import { useRoomChannel } from "@/hooks/useRoomChannel";
import { useRoomVoice } from "@/hooks/useRoomVoice";

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
  } = useRoomChannel(roomId, myName);
  const voice = useRoomVoice(roomId, myName);

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
  const lineCount = scene.lines.length;
  const at = Math.min(currentLine, lineCount - 1);

  const takenBy = (role: string) => participants.find((p) => p.role === role);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6">
      {/* top bar */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/greenroom"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
      <header className="mb-5">
        <p className="font-typewriter text-xs italic tracking-wide text-muted-foreground/70">
          (in the room.)
        </p>
        <h1 className="mt-1 font-brand text-3xl font-semibold text-foreground sm:text-4xl">
          {scene.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {script.title} · shared by {script.owner_name}
        </p>
        {scenes.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScene(i)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  i === sceneIndex
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
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
              className={`flex flex-col items-start border p-3 text-left transition-colors ${
                mine
                  ? "border-primary bg-primary/[0.06]"
                  : takenByOther
                    ? "cursor-not-allowed border-border/40 opacity-70"
                    : "border-border/60 hover:border-primary/40"
              }`}
            >
              <span className="font-typewriter text-sm font-semibold text-foreground">{role}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">
                {mine ? "You" : holder ? holder.name : "Claim this role"}
              </span>
            </button>
          );
        })}
      </div>

      {/* who's here */}
      {participants.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          {participants.map((p) => (
            <span
              key={p.id}
              title={`${p.name}${p.role ? ` · ${p.role}` : ""}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-[#B03000] text-xs font-semibold text-white ring-1 ring-primary/30"
            >
              {(p.name?.[0] || "?").toUpperCase()}
            </span>
          ))}
          {participants.length === 1 && (
            <span className="ml-1 text-xs text-muted-foreground">
              waiting for your partner — hit Invite
            </span>
          )}
        </div>
      )}

      {/* the script */}
      <ScriptView scene={scene} at={at} myRole={myRole} />

      {/* line controls */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setLine(Math.max(0, at - 1))}
            disabled={at <= 0}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/60 disabled:opacity-40"
          >
            <IconChevronLeft className="h-4 w-4" /> Back
          </button>
          <span className="font-typewriter text-xs text-muted-foreground">
            line {at + 1} of {lineCount}
          </span>
          <button
            type="button"
            onClick={() => setLine(Math.min(lineCount - 1, at + 1))}
            disabled={at >= lineCount - 1}
            className="inline-flex items-center gap-1 rounded-full bg-[#CB4B00] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#B03000] disabled:opacity-40"
          >
            Next <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* voice status */}
      <p className="mt-6 text-center text-xs text-muted-foreground/60">
        {voice.error ? (
          <span className="text-red-500">{voice.error}</span>
        ) : voice.joined ? (
          voice.peers.length > 0
            ? "You're on voice together — say your lines and step through in sync."
            : "You're on voice. Waiting for your partner to join the call…"
        ) : (
          "You're synced on the same scene. Tap Voice to rehearse out loud together."
        )}
      </p>
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
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border/60 bg-background p-4 shadow-xl">
          <p className="text-sm font-medium text-foreground">Invite your partner</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Email them a link to this room, or copy it.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendInvite()}
              placeholder="friend@email.com"
              className="min-w-0 flex-1 rounded-md border border-border/60 bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
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
            className="mt-3 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
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
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/40 disabled:opacity-60"
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
    <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-1">
      <button
        type="button"
        onClick={toggleMute}
        title={muted ? "Unmute" : "Mute"}
        className={`flex h-7 w-7 items-center justify-center rounded-full ${
          muted ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {muted ? <IconMicrophoneOff className="h-4 w-4" /> : <IconMicrophone className="h-4 w-4" />}
      </button>
      <span className="px-1 text-xs text-muted-foreground">
        {peers.length > 0 ? "on" : "…"}
      </span>
      <button
        type="button"
        onClick={leave}
        title="Leave voice"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-red-500"
      >
        <IconPhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

function ScriptView({
  scene,
  at,
  myRole,
}: {
  scene: { lines: { line_order: number; character_name: string; text: string }[] };
  at: number;
  myRole: string | null;
}) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [at]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-[#faf7f1] p-5 shadow-sm dark:bg-card/40">
      <div className="space-y-4">
        {scene.lines.map((ln, i) => {
          const active = i === at;
          const mine = myRole && ln.character_name.toUpperCase() === myRole.toUpperCase();
          return (
            <div
              key={ln.line_order}
              ref={active ? activeRef : undefined}
              className={`rounded-lg px-3 py-2 transition-colors ${
                active ? "bg-primary/10" : ""
              }`}
            >
              <p
                className={`font-typewriter text-[11px] uppercase tracking-wider ${
                  mine ? "text-primary" : "text-neutral-500"
                }`}
              >
                {ln.character_name}
                {mine ? " · you" : ""}
              </p>
              <p
                className={`font-typewriter text-[15px] leading-relaxed ${
                  active ? "text-neutral-900 dark:text-foreground" : "text-neutral-600 dark:text-muted-foreground"
                }`}
              >
                {ln.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
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
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
      </span>
      <span className="text-sm text-muted-foreground">
        {n <= 1 ? "just you" : `${n} in the room`}
      </span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function RoomSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <div className="mb-6 h-10 w-48 animate-pulse rounded bg-muted" />
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="h-16 animate-pulse border border-border/40 bg-muted/40" />
        <div className="h-16 animate-pulse border border-border/40 bg-muted/40" />
      </div>
      <div className="h-96 animate-pulse rounded-2xl bg-muted/40" />
    </div>
  );
}
