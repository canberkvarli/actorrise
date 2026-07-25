"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useCommunityLibrary, type CommunityScript } from "@/hooks/useCommunityLibrary";
import { useLobbyPresence } from "@/hooks/useLobbyPresence";
import { useScripts, useShareScript } from "@/hooks/useScripts";
import { GhostLightIntro } from "./GhostLightIntro";

/**
 * The Green Room (Phase A) — the community script library. Actors share their
 * uploaded scripts so others can rehearse the scenes; live rooms come in Phase B.
 * See docs/plans/2026-07-24-green-room-design.md.
 */
export function GreenRoomLibrary() {
  const { data, isLoading } = useCommunityLibrary();

  // Gate first paint so server and first client render agree (React Query's
  // cache can be warm on the client but empty on the server) — avoids a
  // skeleton/grid hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <GhostLightIntro ready={mounted && !!data} />
      <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
      {/* ambient stage wash — the room lit from above */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 h-64"
        style={{
          background:
            "radial-gradient(50% 100% at 50% 0%, rgba(203,75,0,0.10), transparent 70%)",
        }}
      />
      <header className="relative mb-8">
        <p className="font-typewriter text-xs italic tracking-wide text-muted-foreground/70">
          (places, please.)
        </p>
        <h1 className="mt-1 font-brand text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          The Green Room
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Rehearse a scene with another actor, live over voice. Pick a script below,
          claim a role, and share the room link with your partner.
        </p>
        <LobbyPresence />
      </header>

      <section className="mb-12">
        <h2 className="mb-4 font-typewriter text-sm uppercase tracking-[0.18em] text-muted-foreground">
          The community library
        </h2>
        {!mounted || isLoading ? (
          <LibrarySkeleton />
        ) : !data || data.scripts.length === 0 ? (
          <ColdStart total={data?.total ?? 0} />
        ) : (
          <>
            {!data.ready && <SeedBanner total={data.total} />}
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {data.scripts.map((s) => (
                <CommunityScriptCard key={s.id} s={s} />
              ))}
            </motion.div>
          </>
        )}
      </section>

      <ShareYourScripts />
      </div>
    </>
  );
}

function CommunityScriptCard({ s }: { s: CommunityScript }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-typewriter text-lg font-semibold leading-snug text-foreground line-clamp-1">
          {s.title}
        </h3>
        {s.is_demo && (
          <span className="shrink-0 rounded bg-[#CB4B00] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
            Demo
          </span>
        )}
      </div>
      <p className="font-typewriter text-xs text-muted-foreground line-clamp-1">
        {s.author}
      </p>
      <p className="mt-3 text-xs text-muted-foreground/80">
        {s.scene_count} {s.scene_count === 1 ? "scene" : "scenes"} · {s.character_count}{" "}
        {s.character_count === 1 ? "role" : "roles"}
        {s.genre ? <> · <span className="capitalize">{s.genre}</span></> : null}
      </p>
      {s.scene_titles.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {s.scene_titles.slice(0, 3).map((t, i) => (
            <li key={i} className="font-typewriter text-xs text-muted-foreground/70 line-clamp-1">
              · {t}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs text-muted-foreground/60">shared by {s.owner_name}</span>
        <RehearseTogetherButton scriptId={s.id} />
      </div>
    </motion.div>
  );
}

function LobbyPresence() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const myName = user?.name?.trim().split(/\s+/)[0] || "Actor";
  // Pass "" until mounted so the hook doesn't subscribe on the server (no SSR
  // presence → no hydration mismatch).
  const { count } = useLobbyPresence("greenroom-lobby", mounted ? myName : "");

  if (!mounted || count === 0) return null;
  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-sm text-foreground">
        {count === 1
          ? "You're the only one here right now"
          : `${count} actors in the Green Room now`}
      </span>
    </div>
  );
}

function RehearseTogetherButton({ scriptId }: { scriptId: number }) {
  const router = useRouter();
  const start = () => {
    const roomId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    router.push(`/greenroom/room/${roomId}?script=${scriptId}`);
  };
  return (
    <button
      type="button"
      onClick={start}
      className="rounded-full bg-[#CB4B00] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#B03000]"
    >
      Rehearse together →
    </button>
  );
}

function SeedBanner({ total }: { total: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-primary/50 bg-card/30 px-4 py-2.5 text-sm text-muted-foreground">
      <span className="text-foreground">The Green Room is just opening.</span>
      <span>
        These demo scenes get you started — share yours below to fill the board.
      </span>
      <span className="font-typewriter text-xs uppercase tracking-wider text-muted-foreground/60">
        {total} of 3 shared
      </span>
    </div>
  );
}

function ColdStart({ total }: { total: number }) {
  return (
    <div className="border border-dashed border-border/60 bg-card/20 px-6 py-12 text-center">
      <p className="text-lg text-foreground">The doors are about to open.</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        The Green Room is brand new and the community library is still filling up. Share one
        of your scripts below to help kick it off.
      </p>
      <p className="mt-4 font-typewriter text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
        {total} of 3 scripts shared
      </p>
    </div>
  );
}

function ShareYourScripts() {
  const { data: scripts, isLoading } = useScripts();
  const share = useShareScript();

  const own = (scripts ?? []).filter((s) => !s.is_sample);

  if (isLoading || own.length === 0) return null;

  const toggle = (scriptId: number, next: boolean, scenes: number) => {
    if (next && scenes === 0) {
      toast.error("Add a scene to this script first — a room needs something to rehearse.");
      return;
    }
    share.mutate(
      { scriptId, shared: next },
      {
        onSuccess: () =>
          toast.success(next ? "Shared with the community" : "Removed from the community"),
        onError: () => toast.error("Couldn't update sharing. Try again."),
      }
    );
  };

  return (
    <section>
      <h2 className="mb-1 font-typewriter text-sm uppercase tracking-[0.18em] text-muted-foreground">
        Share your scripts
      </h2>
      <p className="mb-4 text-xs text-muted-foreground/70">
        Let other actors rehearse your scenes. You can turn this off anytime.
      </p>
      <ul className="divide-y divide-border/40 border border-border/50 bg-card/30">
        {own.map((s) => {
          const scenes = s.num_scenes_extracted ?? 0;
          const disabled = scenes === 0;
          return (
            <li key={s.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-typewriter text-sm font-medium text-foreground line-clamp-1">
                  {s.title}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {scenes} {scenes === 1 ? "scene" : "scenes"}
                  {disabled ? " · add a scene to share" : ""}
                </p>
              </div>
              <Switch
                checked={!!s.shared_with_community}
                disabled={disabled}
                onCheckedChange={(next) => toggle(s.id, next, scenes)}
                aria-label={`Share ${s.title} with the community`}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LibrarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse border border-border/40 bg-muted/40" />
      ))}
    </div>
  );
}
