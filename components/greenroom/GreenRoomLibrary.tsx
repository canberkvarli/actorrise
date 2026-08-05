"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { useCommunityLibrary, type CommunityScript } from "@/hooks/useCommunityLibrary";
import { useLobbyPresence } from "@/hooks/useLobbyPresence";
import { useSubscription } from "@/hooks/useSubscription";
import { useScripts, useShareScript } from "@/hooks/useScripts";
import { GhostLightIntro } from "./GhostLightIntro";

/** The lit-page shadow the rehearsal canvas uses — a warm page under a stage light. */
const PAGE_GLOW =
  "shadow-[0_18px_60px_-18px_rgba(203,75,0,0.55),0_6px_24px_-8px_rgba(0,0,0,0.7)]";
const PAGE_GLOW_HOVER =
  "hover:shadow-[0_26px_80px_-16px_rgba(203,75,0,0.8),0_10px_32px_-8px_rgba(0,0,0,0.75)]";

/**
 * The Green Room — the community script library. Actors share their uploaded
 * scripts so others can rehearse the scenes together, live over voice.
 *
 * Styled as lit pages on a dark stage, matching the rehearsal screen: the room
 * is always dark (like the nav above it), and each script is a warm page
 * catching the light. See docs/plans/2026-07-24-green-room-design.md.
 */
export function GreenRoomLibrary() {
  const { data, isLoading } = useCommunityLibrary();

  // Starting a room is a Plus feature; joining one you were invited to is not.
  // Guests arrive straight at /greenroom/room/<id> and never pass through here,
  // so gating the library's "Rehearse" action leaves the invite flow open.
  const { subscription, isLoading: tierLoading } = useSubscription();
  const canHost = (subscription?.tier_name ?? "free") !== "free";
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Gate first paint so server and first client render agree (React Query's
  // cache can be warm on the client but empty on the server) — avoids a
  // skeleton/grid hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <GhostLightIntro ready={mounted && !!data} />
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        feature="The Green Room"
        message="Starting a rehearsal room is part of Plus. Your scene partner joins free, from any link you send them."
      />
      <div className="dark min-h-screen bg-[#191410] text-neutral-100">
        <div className="relative mx-auto max-w-5xl px-4 pb-28 pt-10 sm:pt-16">
          {/* ambient stage wash — the room lit from above */}
          <div
            className="pointer-events-none absolute inset-x-0 -top-16 h-80"
            style={{
              background:
                "radial-gradient(55% 100% at 50% 0%, rgba(203,75,0,0.16), transparent 72%)",
            }}
          />

          <header className="relative mb-12 sm:mb-16">
            <p className="font-typewriter text-xs italic tracking-wide text-neutral-400">
              (places, please.)
            </p>
            <h1 className="mt-2 font-brand text-6xl font-semibold leading-[0.95] tracking-tight text-neutral-50 sm:text-8xl">
              The Green
              <br />
              Room
            </h1>
            <p className="mt-5 font-typewriter text-sm text-neutral-400">
              Rehearse with another actor, live.
            </p>
            <LobbyPresence />
          </header>

          <section className="mb-16">
            {!mounted || isLoading ? (
              <LibrarySkeleton />
            ) : !data || data.scripts.length === 0 ? (
              <ColdStart total={data?.total ?? 0} />
            ) : (
              <>
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.06 } } }}
                  className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {data.scripts.map((s) => (
                    <CommunityScriptCard
                      key={s.id}
                      s={s}
                      // Don't flash the paywall while the tier is still loading.
                      canHost={canHost || tierLoading}
                      onBlocked={() => setUpgradeOpen(true)}
                    />
                  ))}
                </motion.div>
                {!data.ready && (
                  <p className="mt-6 font-typewriter text-xs uppercase tracking-[0.18em] text-neutral-500">
                    {data.total} of 3 shared
                  </p>
                )}
              </>
            )}
          </section>

          <ShareYourScripts />
        </div>
      </div>
    </>
  );
}

/** A script as a page under the light: warm stock, dark ink, orange spill. */
function CommunityScriptCard({
  s,
  canHost,
  onBlocked,
}: {
  s: CommunityScript;
  canHost: boolean;
  onBlocked: () => void;
}) {
  const router = useRouter();

  const start = () => {
    if (!canHost) {
      onBlocked();
      return;
    }
    const roomId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    router.push(`/greenroom/room/${roomId}?script=${s.id}`);
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      role="link"
      tabIndex={0}
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          start();
        }
      }}
      className={`group flex h-full cursor-pointer flex-col rounded-xl border border-black/5 bg-[#faf7f1] p-6 text-neutral-900 transition-shadow duration-300 ${PAGE_GLOW} ${PAGE_GLOW_HOVER}`}
    >
      {/* reserve two lines so the metadata sits on the same baseline across the row */}
      <div className="flex min-h-[2.75rem] items-start justify-between gap-3">
        <h3 className="font-typewriter text-base font-bold uppercase leading-snug tracking-wider text-neutral-900 line-clamp-2">
          {s.title}
        </h3>
        {s.is_demo && (
          <span className="shrink-0 bg-[#CB4B00] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
            Demo
          </span>
        )}
      </div>

      <p className="mt-1.5 font-typewriter text-xs text-neutral-500 line-clamp-1">{s.author}</p>

      <p className="mt-4 font-typewriter text-xs uppercase tracking-[0.14em] text-neutral-400">
        {s.character_count} {s.character_count === 1 ? "role" : "roles"} · {s.scene_count}{" "}
        {s.scene_count === 1 ? "scene" : "scenes"}
      </p>

      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <span className="text-[11px] text-neutral-400">shared by {s.owner_name}</span>
        <span className="rounded-full bg-[#CB4B00] px-3.5 py-1.5 text-xs font-medium text-white transition-colors group-hover:bg-[#B03000]">
          Rehearse →
        </span>
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
    <div className="mt-6 inline-flex items-center gap-2.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
      </span>
      <span className="font-typewriter text-sm text-neutral-300">
        {count === 1 ? "just you here" : `${count} actors here now`}
      </span>
    </div>
  );
}

function ColdStart({ total }: { total: number }) {
  return (
    <div className="border border-dashed border-neutral-700 px-6 py-16 text-center">
      <p className="font-brand text-2xl text-neutral-100">The doors are about to open.</p>
      <p className="mt-4 font-typewriter text-xs uppercase tracking-[0.18em] text-neutral-500">
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
      <h2 className="mb-4 font-typewriter text-sm uppercase tracking-[0.18em] text-neutral-500">
        Share your scripts
      </h2>
      <ul className="divide-y divide-neutral-800 border border-neutral-800">
        {own.map((s) => {
          const scenes = s.num_scenes_extracted ?? 0;
          const disabled = scenes === 0;
          return (
            <li key={s.id} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-typewriter text-sm font-medium text-neutral-100 line-clamp-1">
                  {s.title}
                </p>
                <p className="text-xs text-neutral-500">
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
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-52 animate-pulse rounded-xl bg-neutral-800/60" />
      ))}
    </div>
  );
}
