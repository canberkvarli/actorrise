"use client";

import { motion } from "framer-motion";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useCommunityLibrary, type CommunityScript } from "@/hooks/useCommunityLibrary";
import { useScripts, useShareScript } from "@/hooks/useScripts";

/**
 * The Green Room (Phase A) — the community script library. Actors share their
 * uploaded scripts so others can rehearse the scenes; live rooms come in Phase B.
 * See docs/plans/2026-07-24-green-room-design.md.
 */
export function GreenRoomLibrary() {
  const { data, isLoading } = useCommunityLibrary();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
      <header className="mb-8">
        <p className="font-typewriter text-xs italic tracking-wide text-muted-foreground/70">
          (the green room.)
        </p>
        <h1 className="mt-1 font-brand text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          The Green Room
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Rehearse a scene with another actor. Rehearsing together over voice is on the
          way — for now, this is where the community shares scripts to rehearse.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 font-typewriter text-sm uppercase tracking-[0.18em] text-muted-foreground">
          The community library
        </h2>
        {isLoading ? (
          <LibrarySkeleton />
        ) : !data || !data.ready ? (
          <ColdStart total={data?.total ?? 0} />
        ) : (
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
        )}
      </section>

      <ShareYourScripts />
    </div>
  );
}

function CommunityScriptCard({ s }: { s: CommunityScript }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex h-full flex-col border border-border/50 bg-card/40 p-5"
    >
      <h3 className="font-typewriter text-lg font-semibold leading-snug text-foreground line-clamp-1">
        {s.title}
      </h3>
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
        <span className="text-[10px] uppercase tracking-wider text-primary/70">rooms soon</span>
      </div>
    </motion.div>
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
