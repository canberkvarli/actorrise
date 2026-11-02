"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  IconArrowRight,
  IconBooks,
  IconCheck,
  IconChevronDown,
  IconDots,
  IconLoader2,
  IconLock,
  IconPlus,
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
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { useAddToShelf, useMyShares, useSetStatus, useShelfAll } from "@/hooks/useShelf";
import {
  AGES,
  filterShelf,
  formatLength,
  groupByWork,
  TONES,
  type ShelfFilters,
  type ShelfScene,
  type ShelfWork,
} from "@/lib/shelf";
import { useT, type MessageKey } from "@/lib/i18n";
import { ageLabel, characterLabel, contributorLabel, toneLabel } from "@/components/practice/practiceLabels";

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

const STEP = 18;

/** Warm stock under a stage light, as the Green Room's scripts are. */
const PAGE =
  "bg-[#faf7f1] text-neutral-900 shadow-[0_18px_50px_-24px_color-mix(in_oklch,var(--primary)_70%,transparent),0_6px_20px_-10px_rgb(0_0_0/0.6)]";

const PAIRINGS = [
  { value: "mf", label: "appPracticeCommunity.pairMf" },
  { value: "ff", label: "appPracticeCommunity.pairFf" },
  { value: "mm", label: "appPracticeCommunity.pairMm" },
] as const satisfies readonly { value: string; label: MessageKey }[];
const LENGTHS = [
  { value: "short", label: "appPracticeCommunity.lengthShort" },
  { value: "medium", label: "appPracticeCommunity.lengthMedium" },
  { value: "long", label: "appPracticeCommunity.lengthLong" },
] as const satisfies readonly { value: string; label: MessageKey }[];
const ERAS = [
  { value: "classical", label: "appPracticeCommunity.eraClassical" },
  { value: "modern", label: "appPracticeCommunity.eraModern" },
] as const satisfies readonly { value: string; label: MessageKey }[];

/** The library as a way onto the shelf, beside "Bring in a script" at the top
 *  of it. It sat at the foot of the shelf, under every script the actor had,
 *  so the longer the shelf the further away the library went. */
export function CommunityLibraryButton() {
  const [open, setOpen] = useState(false);
  const [warm, setWarm] = useState(false);
  useShelfAll(warm || open);
  const t = useT();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => setWarm(true)}
        onFocus={() => setWarm(true)}
        onTouchStart={() => setWarm(true)}
        className="t-library-pill"
      >
        <IconBooks className="h-3.5 w-3.5" aria-hidden />
        {t("appPracticeCommunity.title")}
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
  const t = useT();
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
  const works = useMemo(() => groupByWork(results), [results]);
  const allWorks = useMemo(() => (scenes ? groupByWork(scenes).length : 0), [scenes]);
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
  const badge = contributorLabel(t, mine.data);

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
              {t("appPracticeCommunity.direction")}
            </p>
            <DialogTitle className="mt-1 font-brand text-3xl font-semibold leading-none tracking-tight sm:text-4xl">
              {t("appPracticeCommunity.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("appPracticeCommunity.description")}
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
            aria-label={t("appPracticeCommunity.searchLabel")}
            placeholder={t("appPracticeCommunity.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-11 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              aria-label={t("search.clearSearch")}
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <IconX className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* One line. On a phone it scrolls sideways rather than stacking. */}
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterPill
            label={t("appPracticeCommunity.pairing")}
            any={t("appPracticeCommunity.pairingAny")}
            value={filters.pairing}
            options={PAIRINGS.map((o) => ({ value: o.value, label: t(o.label) }))}
            onChange={(v) => set("pairing", v)}
          />
          <FilterPill
            label={t("appPracticeCommunity.age")}
            any={t("appPracticeCommunity.ageAny")}
            value={filters.age}
            options={AGES.map((a) => ({ value: a, label: ageLabel(t, a) }))}
            onChange={(v) => set("age", v)}
          />
          <FilterPill
            label={t("appPracticeCommunity.length")}
            any={t("appPracticeCommunity.lengthAny")}
            value={filters.length}
            options={LENGTHS.map((o) => ({ value: o.value, label: t(o.label) }))}
            onChange={(v) => set("length", v)}
          />
          <FilterPill
            label={t("appPracticeCommunity.tone")}
            any={t("appPracticeCommunity.toneAny")}
            value={filters.tone}
            options={TONES.map((tone) => {
              const word = toneLabel(t, tone);
              return { value: tone, label: word[0].toLocaleUpperCase() + word.slice(1) };
            })}
            onChange={(v) => set("tone", v)}
          />
          <FilterPill
            label={t("appPracticeCommunity.era")}
            any={t("appPracticeCommunity.eraAny")}
            value={filters.era}
            options={ERAS.map((o) => ({ value: o.value, label: t(o.label) }))}
            onChange={(v) => set("era", v)}
          />
          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setFilters({});
                setSearch("");
              }}
              className="h-9 shrink-0 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("appPracticeCommunity.clearAll")}
            </button>
          )}
        </div>
      </header>

      {/* Only this moves. Its height is the sheet's, whatever the results. */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 600 && shown < works.length) {
            setPage({ key, n: shown + STEP });
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-5 sm:px-8"
      >
        {all.isLoading || !scenes ? (
          all.isError ? (
            <p className="text-sm text-muted-foreground">{t("appPracticeCommunity.loadFailed")}</p>
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
                ? t("appPracticeCommunity.countAll", { n: scenes.length, plays: allWorks })
                : t("appPracticeCommunity.countSome", {
                    n: results.length,
                    scenes: results.length === 1 ? t("appPracticeCommunity.sceneOne") : t("appPracticeCommunity.sceneMany"),
                    plays: works.length,
                    playWord: works.length === 1 ? t("appPracticeCommunity.playOne") : t("appPracticeCommunity.playMany"),
                  })}
              {all.data?.adds_left === 1 && t("appPracticeCommunity.firstFree")}
              {all.data?.adds_left === 0 && t("appPracticeCommunity.plusRest")}
            </p>
            <Grid>
              <AnimatePresence mode="popLayout" initial={false}>
                {works.slice(0, shown).map((w, i) => (
                  <WorkCard key={w.key} work={w} index={i} onClose={onClose} />
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

/**
 * A play as a lit page, with its scenes listed on it. A play holds three
 * scenes at most, so they sit open on the page rather than behind a fold.
 * The page is not the control; each scene's button is.
 */
function WorkCard({ work, index, onClose }: { work: ShelfWork; index: number; onClose: () => void }) {
  const reduce = useReducedMotion();
  const t = useT();
  const kind =
    work.work_kind === "tv"
      ? t("appPracticeCommunity.kindTv")
      : work.work_kind === "film"
        ? t("appPracticeCommunity.kindFilm")
        : null;
  const byline = [work.author, work.year && work.year > 0 ? String(work.year) : null, kind].filter(Boolean).join(" · ");
  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : Math.min(index, 8) * 0.025 }}
      className={cn("flex flex-col p-5", PAGE)}
    >
      <h3 className="font-brand text-[22px] font-semibold leading-[1.15] tracking-tight text-neutral-900">
        {work.work_title}
      </h3>
      {byline && <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-neutral-500">{byline}</p>}
      <ul className="mt-3 divide-y divide-neutral-200 border-t border-neutral-200">
        {work.scenes.map((s) => (
          <li key={s.id}>
            <SceneRow scene={s} onClose={onClose} />
          </li>
        ))}
      </ul>
    </motion.article>
  );
}

/** One scene on its play's page: who, how long, and the one thing to do. */
function SceneRow({ scene, onClose }: { scene: ShelfScene; onClose: () => void }) {
  const router = useRouter();
  const add = useAddToShelf();
  const t = useT();
  // The same cached page the room drew from: no second request.
  const shelfFull = useShelfAll(true).data?.adds_left === 0;
  const [open, setOpen] = useState(false);
  const [bringOwn, setBringOwn] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const shared = scene.kind === "shared";
  const facts = [formatLength(scene.duration_seconds), scene.tone ? toneLabel(t, scene.tone) : null]
    .filter(Boolean)
    .join(" · ");

  const putOnShelf = () =>
    add.mutate(scene.id, {
      onSuccess: (r) => {
        if (r.added) toast.success(t("appPracticeCommunity.added", { title: scene.title }));
      },
      onError: (e) => {
        const detail = (e as { response?: { data?: { detail?: { error?: string } } } }).response?.data?.detail;
        if (detail?.error === "library_upgrade_required") setUpgrade(true);
        else toast.error((e as Error).message || t("appPracticeCommunity.addFailed"));
      },
    });

  const openMine = (scriptId: number) => {
    onClose();
    router.push(`/practice?script=${scriptId}`);
  };

  const action = shared && scene.is_mine ? null : shared ? (
    <button
      type="button"
      onClick={() => setBringOwn((b) => !b)}
      className="inline-flex h-8 shrink-0 items-center rounded-full border border-neutral-900 px-3 text-[12.5px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-[#faf7f1]"
    >
      {t("appPracticeCommunity.bringYourCopy")}
    </button>
  ) : scene.on_my_shelf ? (
    <button
      type="button"
      onClick={() => openMine(scene.on_my_shelf!)}
      aria-label={t("appPracticeCommunity.onShelfOpen", { title: scene.title })}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-300 px-3 text-[12.5px] font-semibold text-neutral-800 transition-colors hover:border-neutral-900"
    >
      <IconCheck className="h-3.5 w-3.5 text-primary" />
      {t("appPracticeCommunity.onYourShelf")}
    </button>
  ) : shelfFull ? (
    <button
      type="button"
      onClick={() => setUpgrade(true)}
      aria-label={t("appPracticeCommunity.addWithPlus", { title: scene.title })}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-900 px-3 text-[12.5px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-[#faf7f1]"
    >
      <IconLock className="h-3.5 w-3.5" />
      {t("appPracticeCommunity.add")}
    </button>
  ) : (
    <button
      type="button"
      onClick={putOnShelf}
      disabled={add.isPending}
      aria-label={t("appPracticeCommunity.addToShelf", { title: scene.title })}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {add.isPending ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconPlus className="h-3.5 w-3.5" />}
      {t("appPracticeCommunity.add")}
    </button>
  );

  return (
    <div className="py-3">
      <UpgradeModal
        open={upgrade}
        onOpenChange={setUpgrade}
        feature="Community library"
        message={t("appPracticeCommunity.upgradeMessage")}
      />
      <div className="flex items-start gap-3">
        {/* The title opens what happens in the scene; the button does the rest. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-w-0 flex-1 rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex items-center gap-2">
            <span className="text-[14.5px] font-semibold leading-snug text-neutral-900">{scene.title}</span>
            {shared && (
              <span className="shrink-0 border border-neutral-300 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.1em] text-neutral-600">
                {scene.is_mine
                  ? t("appPracticeCommunity.yours")
                  : scene.shared_by
                    ? t("appPracticeCommunity.sharedBy", { name: scene.shared_by })
                    : t("appPracticeCommunity.shared")}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-neutral-700">
            {scene.characters.map((c) => characterLabel(t, c)).join(" & ")}
          </span>
          {(facts || (shared && scene.where)) && (
            <span className="block text-[12px] text-neutral-500">
              {[shared ? scene.where : null, facts].filter(Boolean).join(" · ")}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {action}
          {!shared && <ModeratorMenu scene={scene} />}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {(open && scene.description) || bringOwn ? (
          <motion.div
            key="more"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            {open && scene.description && (
              <p className="pt-2 text-[13px] leading-relaxed text-neutral-600">{scene.description}</p>
            )}
            {bringOwn && (
              <div className="space-y-2.5 pt-2.5 text-[13px] text-neutral-700">
                <p>
                  {t("appPracticeCommunity.itsInA")}
                  <span className="font-semibold text-neutral-900">{scene.work_title}</span>
                  {scene.where ? `, ${scene.where}` : ""}
                  {t("appPracticeCommunity.itsInB")}
                </p>
                <UploadScriptButton
                  variant="compact"
                  className="h-8 rounded-full border border-neutral-900 bg-transparent px-3 text-[12.5px] font-semibold text-neutral-900 shadow-none hover:bg-neutral-900 hover:text-[#faf7f1]"
                >
                  {t("appPracticeCommunity.bringInYourCopy")}
                </UploadScriptButton>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Moderators only: take a scene out of the library for everyone. */
function ModeratorMenu({ scene }: { scene: ShelfScene }) {
  const { user } = useAuth();
  const hide = useSetStatus();
  const t = useT();
  if (!user?.is_moderator) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("appPracticeCommunity.moderator")}
          className="flex h-8 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
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
          {t("appPracticeCommunity.hide")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function NothingLikeIt() {
  const t = useT();
  return (
    <div className="mx-auto max-w-md border border-dashed border-border px-6 py-14 text-center">
      <p className="font-brand text-2xl text-foreground">{t("appPracticeCommunity.nothingTitle")}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {t("appPracticeCommunity.nothingBody")}
      </p>
      <UploadScriptButton
        variant="compact"
        className="mt-5 h-10 rounded-full border border-border bg-transparent px-5 text-sm font-semibold text-foreground shadow-none hover:border-primary hover:bg-primary hover:text-primary-foreground"
      >
        {t("appPracticeCommunity.bringInScript")}
      </UploadScriptButton>
    </div>
  );
}

export default CommunityLibraryButton;
