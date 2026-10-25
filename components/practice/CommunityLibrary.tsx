"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconDots,
  IconLoader2,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import { useAddToShelf, useMyShares, useSetStatus, useShelfAll } from "@/hooks/useShelf";
import {
  AGES,
  contributorLine,
  describeCharacter,
  filterShelf,
  formatLength,
  TONES,
  type ShelfFilters,
  type ShelfScene,
} from "@/lib/shelf";

/*
 * The Community library: two-person scenes to put on your own shelf.
 *
 * Classics cut from public-domain plays go onto the actor's shelf as a script
 * of theirs, one tap, and are rehearsed from there like anything they brought
 * in. Scenes other actors shared are pointers (backend/app/api/shelf.py): where
 * the scene sits, never its words, so those say "bring your copy".
 *
 * A room of its own (a modal) rather than a section of /practice: the search
 * and filters stay put at the top and only the results move, so typing never
 * shoves the page around. The whole library loads once and filters in the
 * browser, so a keystroke answers at once.
 */

const STEP = 36;

/** Warm stock under a stage light, as the Green Room's scripts are. */
const PAGE =
  "bg-[#faf7f1] text-neutral-900 shadow-[0_18px_50px_-24px_color-mix(in_oklch,var(--primary)_70%,transparent),0_6px_20px_-10px_rgb(0_0_0/0.6)]";

const PAIRINGS = [
  { value: "mf", label: "Man & woman" },
  { value: "ff", label: "Two women" },
  { value: "mm", label: "Two men" },
] as const;
const LENGTHS = [
  { value: "short", label: "Under 2 min" },
  { value: "medium", label: "2 to 3½ min" },
  { value: "long", label: "Over 3½ min" },
] as const;
const ERAS = [
  { value: "classical", label: "Classical" },
  { value: "modern", label: "Modern" },
] as const;

/** The way in, under the shelf. Starts loading the library on the way there. */
export function CommunityLibraryEntry() {
  const [open, setOpen] = useState(false);
  const [warm, setWarm] = useState(false);
  useShelfAll(warm || open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => setWarm(true)}
        onFocus={() => setWarm(true)}
        onTouchStart={() => setWarm(true)}
        className="group mt-4 flex w-full items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[color:var(--t-line-light-2)] px-4 py-3.5 text-left transition-colors hover:border-solid hover:border-[color:var(--t-gel-ink)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[color:var(--t-text)]">Community library</span>
          <span className="block text-[13px] text-[color:var(--t-muted-light)]">
            Two-person scenes to put on your shelf
          </span>
        </span>
        <IconArrowRight className="h-4 w-4 shrink-0 text-[color:var(--t-muted-light)] transition-transform group-hover:translate-x-0.5" />
      </button>
      <CommunityLibraryDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CommunityLibraryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        /* A sheet the height of the phone; on a desktop, a room in the middle.
           `dark` and the theatre tokens are on this element because Radix
           portals it to the body, outside the page's own. */
        className={cn(
          "dark theatre-tokens",
          theatreFontVars,
          "flex flex-col gap-0 overflow-hidden border-0 bg-background p-0 text-foreground sm:p-0",
          "left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none",
          "sm:left-[50%] sm:top-[50%] sm:h-[min(880px,calc(100dvh-3rem))] sm:w-[calc(100%-3rem)] sm:max-w-5xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border sm:border-border",
        )}
      >
        <LibraryRoom onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LibraryRoom({ onClose }: { onClose: () => void }) {
  const all = useShelfAll(true);
  const mine = useMyShares();
  const [filters, setFilters] = useState<ShelfFilters>({});
  const [search, setSearch] = useState("");
  // Typing stays instant; the list catches up a frame behind it.
  const q = useDeferredValue(search);
  const scroller = useRef<HTMLDivElement>(null);

  const scenes = all.data?.items;
  const results = useMemo(
    () => (scenes ? filterShelf(scenes, { ...filters, q: q || undefined }) : []),
    [scenes, filters, q],
  );
  const key = JSON.stringify({ ...filters, q });
  /* How many cards are drawn, for this search only: a new search starts again
     at the first handful, at the top, without an effect resetting state. */
  const [page, setPage] = useState({ key, n: STEP });
  const shown = page.key === key ? page.n : STEP;
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [key]);

  const set = <K extends keyof ShelfFilters>(k: K, v: ShelfFilters[K] | undefined) =>
    setFilters((f) => ({ ...f, [k]: v }));
  const anyFilter = Object.values(filters).some(Boolean) || !!search.trim();
  const badge = contributorLine(mine.data);

  return (
    <>
      <header className="relative shrink-0 border-b border-border/70 px-4 pb-4 pt-5 sm:px-8 sm:pt-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              "radial-gradient(55% 100% at 50% 0%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 72%)",
          }}
        />
        <div className="relative flex items-start justify-between gap-4 pr-10 sm:pr-12">
          <div>
            <p className="font-[family-name:var(--t-direction)] text-xs italic tracking-wide text-muted-foreground">
              (two parts, one scene.)
            </p>
            <DialogTitle className="mt-1 font-brand text-3xl font-semibold leading-none tracking-tight sm:text-4xl">
              Community library
            </DialogTitle>
            <DialogDescription className="sr-only">
              Two-person scenes to add to your shelf, and scenes other actors shared.
            </DialogDescription>
          </div>
          {badge && (
            <span className="mt-1 hidden shrink-0 border border-border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground sm:inline">
              {badge}
            </span>
          )}
        </div>

        <div className="relative mt-5">
          <IconSearch
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            autoFocus
            aria-label="Search scenes"
            placeholder="Play, character, moment"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-11 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <IconX className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* One line. On a phone it scrolls sideways rather than stacking. */}
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterPill label="Pairing" any="Any two" value={filters.pairing} options={PAIRINGS} onChange={(v) => set("pairing", v)} />
          <FilterPill
            label="Age"
            any="Any age"
            value={filters.age}
            options={AGES.map((a) => ({ value: a, label: a }))}
            onChange={(v) => set("age", v)}
          />
          <FilterPill label="Length" any="Any length" value={filters.length} options={LENGTHS} onChange={(v) => set("length", v)} />
          <FilterPill
            label="Tone"
            any="Any tone"
            value={filters.tone}
            options={TONES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
            onChange={(v) => set("tone", v)}
          />
          <FilterPill label="Era" any="Any era" value={filters.era} options={ERAS} onChange={(v) => set("era", v)} />
          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setFilters({});
                setSearch("");
              }}
              className="h-9 shrink-0 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </header>

      {/* Only this moves. Its height is the sheet's, whatever the results. */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 600 && shown < results.length) {
            setPage({ key, n: shown + STEP });
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-5 sm:px-8"
      >
        {all.isLoading || !scenes ? (
          all.isError ? (
            <p className="text-sm text-muted-foreground">The library didn&apos;t load. Close it and try again.</p>
          ) : (
            <Grid>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-60 animate-pulse bg-card" />
              ))}
            </Grid>
          )
        ) : results.length === 0 ? (
          <NothingLikeIt />
        ) : (
          <>
            <p className="mb-4 text-[13px] tabular-nums text-muted-foreground">
              {results.length === scenes.length
                ? `${scenes.length} scenes`
                : `${results.length} of ${scenes.length}`}
            </p>
            <Grid>
              <AnimatePresence mode="popLayout" initial={false}>
                {results.slice(0, shown).map((s, i) => (
                  <SceneCard key={s.id} scene={s} index={i} onClose={onClose} />
                ))}
              </AnimatePresence>
            </Grid>
          </>
        )}
      </div>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

/** A filter as a pill that opens the app's own menu, not the browser's. */
function FilterPill<V extends string>({
  label,
  any,
  value,
  options,
  onChange,
}: {
  label: string;
  any: string;
  value: V | undefined;
  options: readonly { value: V; label: string }[];
  onChange: (v: V | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const pick = (v: V | undefined) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${current?.label ?? any}`}
          data-on={!!current}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] text-foreground transition-colors hover:border-foreground/40 data-[on=true]:border-primary data-[on=true]:bg-primary/10 data-[on=true]:text-primary"
        >
          {current?.label ?? any}
          <IconChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      {/* Above the dialog (z 10071), and dark like the room it opens in. */}
      <PopoverContent align="start" className="dark z-[10090] w-48 border-border bg-card p-1 text-foreground">
        {[{ value: undefined, label: any } as { value: V | undefined; label: string }, ...options].map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => pick(o.value)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                on ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {o.label}
              {on && <IconCheck className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** One scene, as a lit page. The page is not the control; its button is. */
function SceneCard({ scene, index, onClose }: { scene: ShelfScene; index: number; onClose: () => void }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const add = useAddToShelf();
  const [bringOwn, setBringOwn] = useState(false);
  const shared = scene.kind === "shared";
  const kicker = [scene.work_title, scene.author?.split(" ").slice(-1)[0], scene.work_kind === "tv" ? "TV" : scene.work_kind === "film" ? "film" : null]
    .filter(Boolean)
    .join(" · ");
  const facts = [formatLength(scene.duration_seconds), scene.tone].filter(Boolean).join(" · ");

  const putOnShelf = () =>
    add.mutate(scene.id, {
      onSuccess: (r) => {
        if (r.added) toast.success(`${scene.title} is on your shelf`);
      },
      onError: (e) => toast.error((e as Error).message || "That didn't go on your shelf. Try again."),
    });

  const openMine = (scriptId: number) => {
    onClose();
    router.push(`/practice?script=${scriptId}`);
  };

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : Math.min(index, 8) * 0.025 }}
      className={cn("flex flex-col p-5", PAGE)}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{kicker}</p>
        {shared ? (
          <span className="shrink-0 border border-neutral-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-600">
            {scene.is_mine ? "yours" : scene.shared_by ? `shared · ${scene.shared_by}` : "shared"}
          </span>
        ) : (
          <ModeratorMenu scene={scene} />
        )}
      </div>

      <h3 className="mt-2 font-brand text-[22px] font-semibold leading-[1.15] tracking-tight text-neutral-900">
        {scene.title}
      </h3>
      {scene.description && (
        <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-neutral-600">{scene.description}</p>
      )}

      <p className="mt-3 text-[13px] text-neutral-800">{scene.characters.map(describeCharacter).join(" & ")}</p>
      {(facts || (shared && scene.where)) && (
        <p className="mt-0.5 text-[12.5px] text-neutral-500">
          {[shared ? scene.where : null, facts].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mt-auto pt-5">
        {bringOwn ? (
          <div className="space-y-3 text-[13px] text-neutral-700">
            <p>
              It&apos;s in <span className="font-semibold text-neutral-900">{scene.work_title}</span>
              {scene.where ? `, ${scene.where}` : ""}. Bring in your copy and pick this scene.
            </p>
            <UploadScriptButton
              variant="compact"
              className="h-9 rounded-full border border-neutral-900 bg-transparent px-4 text-[13px] font-semibold text-neutral-900 shadow-none hover:bg-neutral-900 hover:text-[#faf7f1]"
            >
              Bring in your copy
            </UploadScriptButton>
          </div>
        ) : shared && scene.is_mine ? null : shared ? (
          <button
            type="button"
            onClick={() => setBringOwn(true)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-900 px-4 text-[13px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-[#faf7f1]"
          >
            Bring your copy
          </button>
        ) : scene.on_my_shelf ? (
          <button
            type="button"
            onClick={() => openMine(scene.on_my_shelf!)}
            className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 px-4 text-[13px] font-semibold text-neutral-800 transition-colors hover:border-neutral-900"
          >
            <IconCheck className="h-4 w-4 text-primary" />
            On your shelf
            <IconArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <button
            type="button"
            onClick={putOnShelf}
            disabled={add.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {add.isPending && <IconLoader2 className="h-4 w-4 animate-spin" />}
            Add to my shelf
          </button>
        )}
      </div>
    </motion.article>
  );
}

/** Moderators only: take a scene out of the library for everyone. */
function ModeratorMenu({ scene }: { scene: ShelfScene }) {
  const { user } = useAuth();
  const hide = useSetStatus();
  if (!user?.is_moderator) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Moderator options"
          className="-mr-1.5 -mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
        >
          <IconDots className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="dark z-[10090] w-52 border-border bg-card p-1 text-foreground">
        <button
          type="button"
          onClick={() => hide.mutate({ id: scene.id, status: "hidden" })}
          className="w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
        >
          Hide from the library
        </button>
      </PopoverContent>
    </Popover>
  );
}

function NothingLikeIt() {
  return (
    <div className="mx-auto max-w-md border border-dashed border-border px-6 py-14 text-center">
      <p className="font-brand text-2xl text-foreground">Nobody&apos;s shared one like this yet.</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Got it in a script? Upload it and share where it is.
      </p>
      <UploadScriptButton
        variant="compact"
        className="mt-5 h-10 rounded-full border border-border bg-transparent px-5 text-sm font-semibold text-foreground shadow-none hover:border-primary hover:bg-primary hover:text-primary-foreground"
      >
        Bring in a script
      </UploadScriptButton>
    </div>
  );
}

export default CommunityLibraryEntry;
