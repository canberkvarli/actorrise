"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconSearch } from "@tabler/icons-react";

import { useAuth } from "@/lib/auth";
import { useMyShares, useRehearseShelf, useSetStatus, useShelf } from "@/hooks/useShelf";
import {
  AGES,
  contributorLine,
  describeCharacter,
  formatLength,
  sourceLine,
  TONES,
  type ShelfFilters,
  type ShelfScene,
} from "@/lib/shelf";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";

const PAGE = 12;

/* A filter is a pill you tap, so it is rounded; the rows below are not. */
const FILTER =
  "h-8 shrink-0 cursor-pointer appearance-none rounded-full border border-[color:var(--t-line-light)] bg-transparent px-3 text-[13px] text-[color:var(--t-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[on=true]:border-[color:var(--t-text)]";

const PAIRINGS: [NonNullable<ShelfFilters["pairing"]>, string][] = [
  ["mf", "Man & woman"],
  ["ff", "Two women"],
  ["mm", "Two men"],
];

/**
 * Two-person scenes to rehearse, on the rehearsal room's own floor.
 *
 * Two kinds of scene: classics cut from public-domain plays, which open in one
 * tap, and scenes actors shared, which say where the scene is so you bring your
 * own copy (backend/app/api/shelf.py). Shared ones sort to the top.
 */
export function SceneLibrary() {
  const [filters, setFilters] = useState<ShelfFilters>({});
  const [search, setSearch] = useState("");

  // Typing settles before it asks the server.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: search.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const shelf = useShelf(filters, PAGE);
  const mine = useMyShares();
  const scenes = shelf.data?.pages.flatMap((p) => p.items) ?? [];
  const total = shelf.data?.pages[0]?.total ?? 0;
  const filtered = Object.values(filters).some(Boolean);
  const badge = contributorLine(mine.data);

  const set = <K extends keyof ShelfFilters>(key: K, value: string) =>
    setFilters((f) => ({ ...f, [key]: (value || undefined) as ShelfFilters[K] }));

  // An empty library (before any scene is stored) is not shown at all.
  if (!shelf.isLoading && !shelf.isError && !filtered && total === 0) return null;

  return (
    <section aria-labelledby="scene-library-heading" className="min-w-0">
      <div
        className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3"
        style={{ borderBottom: "1.5px solid var(--t-line-dark-2)" }}
      >
        <h2 id="scene-library-heading" className="t-shelf-heading">
          Find a scene
        </h2>
        {badge && (
          <span className="border border-[color:var(--t-line-light)] px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-[color:var(--t-muted-light)]">
            {badge}
          </span>
        )}
      </div>

      <div className="relative mb-3 max-w-xl">
        <IconSearch
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--t-muted-light)]"
        />
        <input
          type="search"
          aria-label="Search scenes"
          placeholder="Play, character, moment"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full rounded-full border border-[color:var(--t-line-light)] bg-transparent pl-10 pr-4 text-[15px] text-[color:var(--t-text)] placeholder:text-[color:var(--t-muted-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* One line. On a phone it scrolls sideways rather than stacking five
          rows of controls above the first scene. */}
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        <select aria-label="Pairing" className={FILTER} data-on={!!filters.pairing} value={filters.pairing ?? ""} onChange={(e) => set("pairing", e.target.value)}>
          <option value="">Any two</option>
          {PAIRINGS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select aria-label="Age" className={FILTER} data-on={!!filters.age} value={filters.age ?? ""} onChange={(e) => set("age", e.target.value)}>
          <option value="">Any age</option>
          {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="Length" className={FILTER} data-on={!!filters.length} value={filters.length ?? ""} onChange={(e) => set("length", e.target.value)}>
          <option value="">Any length</option>
          <option value="short">Under 2 min</option>
          <option value="medium">2 to 3½ min</option>
          <option value="long">Over 3½ min</option>
        </select>
        <select aria-label="Tone" className={FILTER} data-on={!!filters.tone} value={filters.tone ?? ""} onChange={(e) => set("tone", e.target.value)}>
          <option value="">Any tone</option>
          {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Era" className={FILTER} data-on={!!filters.era} value={filters.era ?? ""} onChange={(e) => set("era", e.target.value)}>
          <option value="">Any era</option>
          <option value="classical">Classical</option>
          <option value="modern">Modern</option>
        </select>
      </div>

      {shelf.isLoading ? (
        <div className="space-y-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="t-maprow t-maprow--open is-locked h-[68px] animate-pulse" />
          ))}
        </div>
      ) : shelf.isError ? (
        <p className="text-sm text-[color:var(--t-muted-light)]">The scene library didn&apos;t load. Try again in a moment.</p>
      ) : scenes.length === 0 ? (
        <div className="max-w-md">
          <p className="text-sm leading-relaxed text-[color:var(--t-text)]">
            Nobody&apos;s shared one like this yet. Got it in a script? Upload it and share where it is.
          </p>
          <UploadScriptButton variant="compact" className="t-bring-in mt-3">Bring in a script</UploadScriptButton>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {scenes.map((scene) => (
            <li key={scene.id}>
              <LibraryRow scene={scene} />
            </li>
          ))}
        </ol>
      )}

      {shelf.hasNextPage && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => shelf.fetchNextPage()}
            disabled={shelf.isFetchingNextPage}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--t-line-light)] px-4 text-[13px] font-semibold text-[color:var(--t-text)] transition-colors hover:border-[color:var(--t-text)] disabled:opacity-60"
          >
            {shelf.isFetchingNextPage && <IconLoader2 className="h-3.5 w-3.5 animate-spin" />}
            More scenes
          </button>
          <span className="text-xs tabular-nums text-[color:var(--t-muted-light)]">
            {scenes.length} of {total}
          </span>
        </div>
      )}
    </section>
  );
}

/** One scene. A classic opens to rehearse; a shared one says where to find it. */
function LibraryRow({ scene }: { scene: ShelfScene }) {
  const router = useRouter();
  const { user } = useAuth();
  const rehearse = useRehearseShelf();
  const setStatus = useSetStatus();
  const [bringOwn, setBringOwn] = useState(false);

  const shared = scene.kind === "shared";
  const theirs = shared && !scene.is_mine;
  const facts = [
    scene.characters.map(describeCharacter).join(" & "),
    formatLength(scene.duration_seconds),
    scene.tone,
  ].filter(Boolean);

  const go = () =>
    rehearse.mutate(scene.id, {
      onSuccess: (r) => {
        if (r.scene_id) router.push(`/scenes/${r.scene_id}/rehearse`);
        else setBringOwn(true);
      },
    });

  return (
    /* Sharp: the row is not the control, its button is. Inline because the
       unlayered .t-maprow radius beats a Tailwind utility. */
    <div
      className="t-maprow t-maprow--built"
      style={{ borderRadius: 0, ...(shared ? { borderLeftColor: "var(--t-gel-ink)" } : {}) }}
    >
      <div className="flex items-center gap-3 py-3 pl-3 pr-2 sm:pl-4 sm:pr-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="t-maprow__title">{scene.title}</span>
            {shared && (
              <span className="t-maprow__tag">
                {scene.is_mine ? "yours" : scene.shared_by ? `shared · ${scene.shared_by}` : "shared"}
              </span>
            )}
          </div>
          {/* Wraps on a phone: cut at 200px, "Sister Aloysius (F, 50s+) & F…"
              loses the second part, which is the half of the pairing you scan for. */}
          <span className="t-maprow__detail block sm:truncate">{sourceLine(scene)}</span>
          {facts.length > 0 && <span className="t-maprow__detail block sm:truncate">{facts.join(" · ")}</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={go}
            disabled={rehearse.isPending || bringOwn}
            className={
              theirs
                ? "inline-flex h-9 items-center rounded-full border border-[color:var(--t-line-light)] px-3.5 text-[13px] font-semibold text-[color:var(--t-text)] transition-colors hover:border-[color:var(--t-text)] disabled:opacity-60"
                : "inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            }
          >
            {rehearse.isPending ? "Opening…" : theirs ? "Bring your copy" : "Rehearse"}
          </button>
          {user?.is_moderator && !scene.is_mine && (
            <button
              type="button"
              onClick={() => setStatus.mutate({ id: scene.id, status: "hidden" })}
              disabled={setStatus.isPending}
              className="text-[11px] text-[color:var(--t-muted-light)] hover:text-[color:var(--t-text)]"
            >
              Hide
            </button>
          )}
        </div>
      </div>
      {rehearse.isError && (
        <p className="px-4 pb-3 text-xs text-destructive">{(rehearse.error as Error).message}</p>
      )}
      {bringOwn && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--t-line-light)] px-4 py-3 text-sm text-[color:var(--t-text)]">
          <p className="min-w-0 flex-1">
            It&apos;s in <span className="font-semibold">{scene.work_title}</span>
            {scene.where ? `, ${scene.where}` : ""}. Bring in your copy and pick this scene.
          </p>
          <UploadScriptButton variant="compact" className="t-bring-in">Bring in your copy</UploadScriptButton>
        </div>
      )}
    </div>
  );
}

export default SceneLibrary;
