"use client";

import { useMemo, useState } from "react";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";

import { PracticeLibraryRail, ScriptCard } from "@/components/practice/PracticeLibraryRail";
import type { UserScript } from "@/hooks/useScripts";
import { getGenreInkColor, getGenreSpineColor } from "@/lib/genreColors";
import {
  SHELF_PAGE,
  groupShelf,
  matchesShelf,
  sortShelf,
  splitShelf,
  type ShelfEntry,
  type ShelfSort,
} from "@/lib/shelfOrganize";

interface ShelfSectionsProps {
  /** Everything on the shelf, in the actor's order (house copies last). */
  scripts: UserScript[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRequestDelete: (script: UserScript) => void;
  onReport: (script: UserScript) => void;
  onReorder: (scriptIds: number[]) => void;
}

const SORTS: { key: ShelfSort; label: string }[] = [
  { key: "mine", label: "your order" },
  { key: "recent", label: "newest" },
  { key: "az", label: "a to z" },
];

/**
 * The shelf, sorted by where a script came from: the actor's own uploads, the
 * scenes they took from the Community library, then the house copies.
 *
 * A short shelf looks exactly as it always did, the actor's own arrangement
 * included. A long one (a teacher's 500 sides, a library habit) grows a search
 * box, shows each section's first few with a "show all", and folds scripts of
 * the same title into one entry, so twelve files typed up from one film read
 * as that film.
 */
export function ShelfSections({
  scripts,
  selectedId,
  onSelect,
  onRequestDelete,
  onReport,
  onReorder,
}: ShelfSectionsProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ShelfSort>("mine");
  const { own, community, house } = useMemo(() => splitShelf(scripts), [scripts]);
  const crowded = own.length + community.length > SHELF_PAGE;
  const searching = query.trim().length > 0;

  const pick = (list: UserScript[]) => sortShelf(list.filter((s) => matchesShelf(s, query)), sort);
  const ownShown = pick(own);
  const communityShown = pick(community);
  const houseShown = house.filter((s) => matchesShelf(s, query));
  const nothing = searching && ownShown.length + communityShown.length + houseShown.length === 0;
  const labelled = own.length > 0 && community.length > 0;

  const card = { selectedId, onSelect, onRequestDelete, onReport };

  // The actor's own arrangement, draggable, while the shelf is short enough to
  // arrange and nothing is filtering or re-sorting it.
  const arrangeable =
    !searching && sort === "mine" && own.length <= SHELF_PAGE && groupShelf(own).every((e) => e.kind === "one");

  return (
    <div className="flex flex-col gap-5">
      {crowded && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 border-b border-[color:var(--t-line-light-2)] px-1 pb-2">
            <IconSearch className="h-3.5 w-3.5 shrink-0 text-[color:var(--t-muted-light)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a script, a scene or a character"
              aria-label="Find on your shelf"
              className="w-full bg-transparent text-[14px] text-[color:var(--t-text)] placeholder:text-[color:var(--t-muted-light)] focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-3 px-1" role="group" aria-label="Sort the shelf">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={`t-shelf-link ${sort === s.key ? "underline underline-offset-4" : ""}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {ownShown.length > 0 && (
        <Section label={labelled ? "Yours" : null}>
          {arrangeable ? (
            <PracticeLibraryRail
              scripts={ownShown}
              orientation="column"
              // The library copies keep their places after the actor's own.
              onReorder={(ids) => onReorder([...ids, ...community.map((s) => s.id)])}
              {...card}
            />
          ) : (
            <Entries scripts={ownShown} expandAll={searching} {...card} />
          )}
        </Section>
      )}

      {communityShown.length > 0 && (
        <Section label="From the Community library">
          <Entries scripts={communityShown} expandAll={searching} {...card} />
        </Section>
      )}

      {houseShown.length > 0 && (
        <Section label={null}>
          <PracticeLibraryRail scripts={houseShown} orientation="column" {...card} />
        </Section>
      )}

      {nothing && (
        <p className="px-1 text-[13px] text-[color:var(--t-muted-light)]">Nothing on your shelf matches.</p>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string | null; children: React.ReactNode }) {
  return (
    <section aria-label={label ?? undefined}>
      {label && (
        <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--t-muted-light)]">
          {label}
        </h3>
      )}
      {children}
    </section>
  );
}

type CardProps = Pick<ShelfSectionsProps, "selectedId" | "onSelect" | "onRequestDelete" | "onReport">;

/** A section's scripts, same-title files folded together, the first few shown. */
function Entries({ scripts, expandAll, ...card }: { scripts: UserScript[]; expandAll: boolean } & CardProps) {
  const [all, setAll] = useState(false);
  const entries = groupShelf(scripts);
  const shown = all || expandAll ? entries : entries.slice(0, SHELF_PAGE);
  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((entry, i) =>
        entry.kind === "one" ? (
          <One key={entry.script.id} script={entry.script} index={i} {...card} />
        ) : (
          <Group key={`g-${entry.scripts[0].id}`} entry={entry} open={expandAll} {...card} />
        ),
      )}
      {!all && !expandAll && entries.length > SHELF_PAGE && (
        <button type="button" onClick={() => setAll(true)} className="t-shelf-link mt-1 self-start px-1">
          show all {entries.length}
        </button>
      )}
    </div>
  );
}

function One({
  script,
  index,
  label,
  selectedId,
  onSelect,
  onRequestDelete,
  onReport,
}: { script: UserScript; index: number; label?: string } & CardProps) {
  return (
    <ScriptCard
      script={script}
      index={index}
      label={label}
      selected={script.id === selectedId}
      column
      onSelect={() => onSelect(script.id)}
      onRequestDelete={() => onRequestDelete(script)}
      onRequestReport={() => onReport(script)}
    />
  );
}

/** Several files of one title: one row that opens to show them. */
function Group({
  entry,
  open: forced,
  ...card
}: { entry: Extract<ShelfEntry<UserScript>, { kind: "group" }>; open: boolean } & CardProps) {
  const holdsSelected = entry.scripts.some((s) => s.id === card.selectedId);
  const [open, setOpen] = useState(holdsSelected);
  const isOpen = forced || open;
  const scenes = entry.scripts.reduce((n, s) => n + (s.num_scenes_extracted || 0), 0);
  const files = entry.scripts.length;
  const first = entry.scripts[0];
  return (
    <div>
      {/* Bound like the scripts around it, so a film of twelve files sits on
          the shelf as one volume rather than as a different kind of thing. */}
      <div
        className="t-script"
        style={{
          ["--spine" as string]: getGenreSpineColor(first.genre),
          ["--spine-ink" as string]: getGenreInkColor(first.genre),
        }}
      >
        <span className="t-script__bind" />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={isOpen} className="t-script__face">
          <span className="t-script__title">{entry.title}</span>
          <span className="t-script__foot">
            <span className="t-script__byline">
              {first.genre && <span className="t-script__stamp">{first.genre}</span>}
            </span>
            <span className="t-script__count inline-flex items-center gap-1.5">
              {scenes === files ? `${scenes} scenes` : `${files} files · ${scenes} scenes`}
              <IconChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
            </span>
          </span>
        </button>
      </div>
      {isOpen && (
        <div className="mt-1.5 ml-3 flex flex-col gap-1.5 border-l border-[color:var(--t-line-light-2)] pl-3">
          {entry.scripts.map((s, i) => (
            // Inside the film, each file is named by its scene.
            <One key={s.id} script={s} index={i} label={s.scene_titles?.[0] || s.first_scene_title || undefined} {...card} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ShelfSections;
