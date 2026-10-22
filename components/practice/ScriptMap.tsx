"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconArrowRight, IconFileSearch, IconLoader2, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { entrance } from "@/lib/motion";
import { formatSceneDuration, type Scene } from "@/lib/scenes";
import {
  tickRoom,
  tickableRows,
  toggleTick,
  type MapGroup,
  type MapRow,
  type ScannedScene,
} from "@/lib/scriptMap";
import type { SceneMapResponse } from "@/hooks/useSceneMap";

const NEVER_CHANGES = () => () => {};
const NONE: ReadonlySet<number> = new Set();

/** The first row that can be ticked, so "Build scenes" up top can land on it. */
export const FIRST_OPEN_ROW_ID = "script-map-first-open";

interface ScriptMapProps {
  /** The read laid over what is built (lib/scriptMap mergeSceneMap). */
  groups: MapGroup[];
  scenes: Scene[];
  /** The scene map, once it has answered. Undefined for samples and while loading. */
  map: SceneMapResponse | undefined;
  mapLoading: boolean;
  canManage: boolean;
  isProcessing: boolean;
  openingId: number | null;
  onOpen: (sceneId: number) => void;
  onPrefetch: (sceneId: number) => void;
  /** Older uploads: ask for the file once (UploadProvider.showWholeScript). */
  onShowWholeScript: () => void;
  /** Build the ticked rows. Resolves true when the server took them. */
  onBuild: (picks: ScannedScene[]) => Promise<boolean>;
  onUpgrade: () => void;
}

/**
 * The whole script, in script order.
 *
 * Built scenes are rows you open. The rest of the script is on the same page,
 * dimmed, with a box to tick, so building another scene is a tick and a press
 * rather than a trip into a modal that showed the same list. Built scenes are
 * never touched by building more: the server only appends.
 */
export function ScriptMap({
  groups,
  scenes,
  map,
  mapLoading,
  canManage,
  isProcessing,
  openingId,
  onOpen,
  onPrefetch,
  onShowWholeScript,
  onBuild,
  onUpgrade,
}: ScriptMapProps) {
  const ready = map && !map.needs_file ? map : null;
  const needsFile = canManage && map?.needs_file === true;

  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [overLimit, setOverLimit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /* What was just sent to be built. Those rows say "building" until the map
     comes back with them in it, instead of springing back to an empty box. */
  const [building, setBuilding] = useState<Set<number>>(() => new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Only while the script is being read: once it is done the map has the new
  // scenes in it as built rows, and the marks have served.
  const showBuilding = isProcessing ? building : NONE;

  const room = ready ? tickRoom(ready.limit, ready.built_count) : null;
  const pickable = tickableRows(groups);
  const limit = ready?.limit ?? null;
  const canTick = canManage && !!ready && !isProcessing && !submitting;

  const toggle = (scan: ScannedScene) => {
    if (!canTick) return;
    const out = toggleTick(picked, scan.index, room);
    setPicked(out.picked);
    setOverLimit(out.overLimit);
  };

  const build = async () => {
    if (!ready || picked.size === 0) return;
    const picks = (ready.scan.scenes ?? []).filter((s) => picked.has(s.index));
    setSubmitting(true);
    const ok = await onBuild(picks);
    setSubmitting(false);
    if (ok) {
      setBuilding(new Set(picked));
      setPicked(new Set());
      setOverLimit(false);
    }
  };

  const showHeadings = groups.length > 1;
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const totalBuilt = groups.reduce((n, g) => n + g.builtCount, 0);
  let drawn = 0;
  let firstOpenMarked = false;

  return (
    <section className="t-map" aria-label="Scenes in this script">
      {isProcessing && scenes.length > 0 && (
        <p className="t-map__note">
          <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
          Adding the scenes you picked. They&apos;ll appear here.
        </p>
      )}

      {/* One act needs no heading; the count still earns a line when there is
          more script than is built. */}
      {!showHeadings && ready && totalRows > totalBuilt && (
        <p className="t-map__count">
          {totalBuilt} of {totalRows} built
        </p>
      )}

      <div className="space-y-8">
        {groups.map((group, gi) => (
          <div key={group.act ?? `g${gi}`}>
            {showHeadings && (
              <div className="t-map__act">
                <h3 className="t-map__act-name">{group.act ?? "Scenes"}</h3>
                {ready && (
                  <span className="t-map__act-count">
                    {group.builtCount} of {group.rows.length} built
                  </span>
                )}
              </div>
            )}
            <ol className="space-y-1.5">
              {group.rows.map((row, ri) => {
                const index = drawn++;
                const isFirstOpen =
                  !firstOpenMarked && row.kind === "open" && row.locked === null;
                if (isFirstOpen) firstOpenMarked = true;
                return (
                  <li key={row.key}>
                    {row.kind === "built" ? (
                      <BuiltRow
                        scene={row.scene}
                        index={index}
                        position={ri + 1}
                        expanded={expandedId === row.scene.id}
                        onToggle={() => {
                          setExpandedId((cur) => (cur === row.scene.id ? null : row.scene.id));
                          onPrefetch(row.scene.id);
                        }}
                        onOpen={() => onOpen(row.scene.id)}
                        opening={openingId === row.scene.id}
                        dimmed={openingId !== null && openingId !== row.scene.id}
                      />
                    ) : (
                      <OpenRow
                        row={row}
                        index={index}
                        position={ri + 1}
                        id={isFirstOpen ? FIRST_OPEN_ROW_ID : undefined}
                        picked={picked.has(row.scan.index)}
                        building={showBuilding.has(row.scan.index)}
                        disabled={!canTick}
                        onToggle={() => toggle(row.scan)}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

      {canManage && mapLoading && !map && <MapLoading />}

      {needsFile && (
        <button type="button" onClick={onShowWholeScript} className="t-map__whole">
          <IconFileSearch className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 text-left">Show the whole script</span>
          <IconArrowRight className="h-4 w-4 shrink-0" />
        </button>
      )}

      <BuildBar
        count={picked.size}
        pickable={pickable.length}
        overLimit={overLimit}
        limit={limit}
        submitting={submitting}
        onBuild={build}
        onClear={() => {
          setPicked(new Set());
          setOverLimit(false);
        }}
        onUpgrade={onUpgrade}
      />
    </section>
  );
}

/** "Scene 4 · ANNA & BEN · 3 min · 40 lines", from whatever the scene has. */
function builtDetail(scene: Scene): string[] {
  const parts: string[] = [];
  const characters = [scene.character_1_name, scene.character_2_name].filter(Boolean);
  // The script's own label rides in the facts. The numeral counts rows: a
  // series that skips its one-voice openers would otherwise number 2, 3, 4.
  if (scene.scene_number) parts.push(scene.scene_number);
  if (characters.length > 0) parts.push(characters.join(" & "));
  const duration = formatSceneDuration(scene.estimated_duration_seconds);
  if (duration) parts.push(duration);
  if (scene.line_count > 0) parts.push(`${scene.line_count} lines`);
  return parts;
}

/**
 * A built scene. Tap the row for its synopsis; Open goes straight in.
 *
 * Open used to live inside the fold, so every scene cost two taps. It is on the
 * row now, always visible (not on hover, which a phone never fires).
 */
function BuiltRow({
  scene,
  index,
  position,
  expanded,
  onToggle,
  onOpen,
  opening,
  dimmed,
}: {
  scene: Scene;
  index: number;
  position: number;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** This is the one being opened: it takes the light. */
  opening: boolean;
  /** Another one is being opened: stand down. */
  dimmed: boolean;
}) {
  const reduce = useReducedMotion();
  const ent = entrance(index, { reduce, y: 6, duration: 0.36 });
  const detail = builtDetail(scene);

  return (
    <motion.div
      /* Spread would not do here: `transition={undefined}` in the normal case
         overrides the entrance's own delay and kills the stagger. */
      initial={ent.initial}
      animate={
        opening
          ? { opacity: 1, y: 0, scale: 1.01 }
          : dimmed
            ? { opacity: 0.35, y: 0, scale: 1 }
            : ent.animate
      }
      transition={opening || dimmed ? { duration: 0.19, ease: [0.22, 1, 0.36, 1] } : ent.transition}
      style={
        opening
          ? { boxShadow: "0 0 0 1.5px var(--t-gel-ink), 0 14px 34px -14px rgb(0 0 0 / 0.4)" }
          : undefined
      }
      className={cn("t-maprow t-maprow--built", expanded && "is-expanded")}
    >
      <div className="flex items-center gap-2 pr-2 sm:pr-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-3 pl-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pl-4"
        >
          <span aria-hidden className="t-maprow__num">
            {position}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="t-maprow__title truncate">{scene.title}</span>
              {/* The line check's mark, when that lands (Scene.flagged). Quiet:
                  a note in the margin, not an alarm. */}
              {scene.flagged && <span className="t-maprow__flag">check lines</span>}
            </span>
            {detail.length > 0 && (
              <span className="t-maprow__detail block truncate">{detail.join(" · ")}</span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpen}
          disabled={opening}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {opening ? "Curtain up…" : "Open"}
          {!opening && <IconArrowRight className="hidden h-3.5 w-3.5 sm:block" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <p className="t-maprow__synopsis">
              {scene.description?.trim() || "No synopsis for this scene yet."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * A scene in the script that is not built. Dimmed, with a box to tick.
 *
 * The whole row is the label, so the target is the row and not a 17px box. A
 * one-voice scene says "solo" and has no box: ScenePartner reads the other
 * part, and there is no other part.
 */
function OpenRow({
  row,
  index,
  position,
  id,
  picked,
  building,
  disabled,
  onToggle,
}: {
  row: Extract<MapRow, { kind: "open" }>;
  index: number;
  position: number;
  id?: string;
  picked: boolean;
  building: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  const ent = entrance(index, { reduce, y: 6, duration: 0.36 });
  const { scan, locked } = row;
  const name = scan.scene_label ?? `Scene ${position}`;
  const cast =
    scan.characters.length > 0
      ? scan.characters.slice(0, 3).join(", ") +
        (scan.characters.length > 3 ? ` +${scan.characters.length - 3}` : "")
      : null;
  const detail = [cast, scan.line_count > 0 ? `${scan.line_count} lines` : null].filter(
    Boolean,
  ) as string[];
  const tickable = locked === null && !building;

  const body = (
    <>
      <span aria-hidden className="t-maprow__num">
        {position}
      </span>
      <span className="t-maprow__body min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="t-maprow__label">{name}</span>
          {scan.title && <span className="t-maprow__subtitle truncate">{scan.title}</span>}
        </span>
        {detail.length > 0 && (
          <span className="t-maprow__detail block truncate">{detail.join(" · ")}</span>
        )}
      </span>
    </>
  );

  if (!tickable) {
    return (
      <motion.div {...entrance(index, { reduce, y: 6, duration: 0.36 })} className="t-maprow t-maprow--open is-locked">
        <div className="flex items-center gap-3 py-3 pl-3 pr-3 sm:pl-4 sm:pr-4">
          {body}
          <span className="t-maprow__tag">
            {building ? (
              <>
                <IconLoader2 className="h-3 w-3 animate-spin" />
                building
              </>
            ) : locked === "solo" ? (
              "solo"
            ) : (
              "built"
            )}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.label
      initial={ent.initial}
      animate={ent.animate}
      transition={ent.transition}
      className={cn("t-maprow t-maprow--open", picked && "is-picked", disabled && "is-disabled")}
    >
      <span className="flex items-center gap-3 py-3 pl-3 pr-3 sm:pl-4 sm:pr-4">
        {body}
        <input
          id={id}
          type="checkbox"
          checked={picked}
          disabled={disabled}
          onChange={onToggle}
          className="peer sr-only"
          aria-label={`Build ${name}`}
        />
        <span aria-hidden className="t-maprow__box">
          {picked && (
            <svg
              viewBox="0 0 12 12"
              className="h-[11px] w-[11px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 6.4 4.8 8.7 9.5 3.6" />
            </svg>
          )}
        </span>
      </span>
    </motion.label>
  );
}

/** Ghost rows while the map is read. Same geometry as an open row. */
function MapLoading() {
  return (
    <div className="mt-1.5 space-y-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="t-maprow t-maprow--open is-locked h-[60px] animate-pulse" />
      ))}
    </div>
  );
}

/**
 * The bar that slides up once something is ticked.
 *
 * Portalled to the body: the opened script sits inside a motion wrapper, and a
 * transformed ancestor would pin a fixed bar to it instead of the viewport. So
 * it reads the app's own tokens (card, border, primary), not the room's, which
 * do not reach the body.
 *
 * Past the plan's allowance it carries the picker's own upgrade line, and only
 * then: a free actor sees the wall the moment they reach for a second scene,
 * not before.
 */
function BuildBar({
  count,
  pickable,
  overLimit,
  limit,
  submitting,
  onBuild,
  onClear,
  onUpgrade,
}: {
  count: number;
  pickable: number;
  overLimit: boolean;
  limit: number | null;
  submitting: boolean;
  onBuild: () => void;
  onClear: () => void;
  onUpgrade: () => void;
}) {
  const reduce = useReducedMotion();
  // The house pattern for a portal (CallboardDock): no body on the server.
  const mounted = useSyncExternalStore(NEVER_CHANGES, () => true, () => false);
  if (!mounted) return null;

  const showLimit = overLimit && limit != null;
  const open = count > 0 || showLimit;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="build-bar"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-1/2 z-[9980] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
          role="region"
          aria-label="Build the ticked scenes"
        >
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-card-foreground shadow-lg shadow-black/20">
            {showLimit && (
              <p className="mb-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
                Your plan builds {limit} {limit === 1 ? "scene" : "scenes"} from a script.{" "}
                <button
                  type="button"
                  onClick={onUpgrade}
                  className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
                >
                  Build the whole play
                </button>
                , and you come straight back here.
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {count === 0 ? (
                  "Nothing ticked"
                ) : (
                  <>
                    <span className="font-semibold text-foreground">{count}</span> of {pickable} ticked
                  </>
                )}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onClear}
                  aria-label={count === 0 ? "Close" : undefined}
                  className="inline-flex h-9 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {count === 0 ? <IconX className="h-4 w-4" /> : "Clear"}
                </button>
                {count > 0 && (
                  <button
                    type="button"
                    onClick={onBuild}
                    disabled={submitting}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting && <IconLoader2 className="h-4 w-4 animate-spin" />}
                    Build {count} {count === 1 ? "scene" : "scenes"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ScriptMap;
