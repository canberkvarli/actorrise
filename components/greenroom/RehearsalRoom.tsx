"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconLink,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import { useCommunityScript } from "@/hooks/useCommunityScript";
import { useRoomChannel } from "@/hooks/useRoomChannel";

export function RehearsalRoom({ roomId, scriptId }: { roomId: string; scriptId: number }) {
  const { user } = useAuth();
  const myName = (user?.name?.trim().split(/\s+/)[0]) || "Actor";
  const { data: script, isLoading } = useCommunityScript(scriptId);
  const {
    participants,
    sceneIndex,
    setScene,
    currentLine,
    setLine,
    myRole,
    claimRole,
    connected,
  } = useRoomChannel(roomId, myName);

  // Gate first paint so server and first client render agree (React Query cache
  // can be warm on the client, empty on the server) — avoids a hydration flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Invite link copied — send it to your partner.");
    } catch {
      toast.error("Couldn't copy — copy the URL from the address bar.");
    }
  };

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
          <button
            type="button"
            onClick={copyInvite}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#CB4B00] px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#B03000]"
          >
            <IconLink className="h-4 w-4" /> Invite
          </button>
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

      {/* voice note (audio is the next increment) */}
      <p className="mt-6 text-center text-xs text-muted-foreground/60">
        You&apos;re synced on the same scene. Live voice is coming — for now, hop on a
        call and run it together, in step.
      </p>
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
