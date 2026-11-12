"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Scene } from "@/lib/scenes";
import {
  actsIn,
  addAct,
  changes,
  moveTo,
  removeScene,
  renameAct,
  renameScene,
  settle,
  tidy,
  toRows,
  type LayoutRow,
  type LayoutScene,
} from "@/lib/scriptLayout";
import { invalidateShelf } from "@/hooks/useScripts";
import { invalidateSceneMap } from "@/hooks/useSceneMap";

const NO_HEADING = "__none__";
const NEW_HEADING = "__new__";

/**
 * The script's map, put right by hand: the web's door to what the app calls
 * "edit the map". The reader gets headings wrong now and then (an episode
 * split in two, a scene filed under the act before it), so here every scene
 * can be dragged under any heading, moved to another act or episode, renamed
 * or taken off, and every heading renamed. Nothing changes until Save.
 *
 * The moves are `lib/scriptLayout.ts`, the same file the app uses.
 */
export function EditScriptMapModal({
  open,
  onOpenChange,
  scriptId,
  scenes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scriptId: number;
  scenes: Scene[];
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const before = useMemo<LayoutScene[]>(
    () => scenes.map((s) => ({ id: s.id, title: s.title, act: s.act ?? null })),
    [scenes],
  );
  const [rows, setRows] = useState<LayoutRow[]>(() => toRows(before));
  const [saving, setSaving] = useState(false);

  // Opened afresh each time: whatever was left unsaved last time is gone.
  useEffect(() => {
    if (open) setRows(toRows(before));
  }, [open, before]);

  const diff = changes(before, tidy(rows));
  const dirty = diff.deleted.length > 0 || diff.renamed.length > 0 || diff.layout !== null;
  const acts = actsIn(rows);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setRows((cur) => {
      const from = cur.findIndex((r) => r.key === active.id);
      const to = cur.findIndex((r) => r.key === over.id);
      if (from < 0 || to < 0) return cur;
      return settle(arrayMove(cur, from, to));
    });
  };

  const close = (next: boolean) => {
    if (!next && dirty && !saving && !window.confirm(t("appPracticeEditMap.leave"))) return;
    onOpenChange(next);
  };

  const move = (sceneId: number, value: string) => {
    if (value === NEW_HEADING) {
      const name = window.prompt(t("appPracticeEditMap.newHeadingPrompt"));
      if (name?.trim()) setRows((cur) => moveTo(cur, sceneId, name));
      return;
    }
    setRows((cur) => moveTo(cur, sceneId, value === NO_HEADING ? null : value));
  };

  const save = async () => {
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      for (const id of diff.deleted) await api.delete(`/api/scripts/${scriptId}/scenes/${id}`);
      if (diff.layout) await api.put(`/api/scripts/${scriptId}/layout`, { scenes: diff.layout });
      for (const r of diff.renamed) await api.patch(`/api/scripts/${scriptId}/scenes/${r.id}`, { title: r.title });
      toast.success(t("appPracticeEditMap.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("appPracticeEditMap.failed"));
    } finally {
      // Whatever went through is on the server, so the page reads it again either way.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["scripts", scriptId] }),
        invalidateSceneMap(queryClient, scriptId),
        invalidateShelf(queryClient),
      ]);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={`t-formsheet theatre-tokens ${theatreFontVars} max-w-[600px] gap-0 border-0 p-0`}>
        <DialogTitle className="sr-only">{t("appPracticeEditMap.title")}</DialogTitle>
        <div className="max-h-[85vh] overflow-y-auto px-7 pb-6 pt-7 sm:px-8">
          <h2 className="t-formsheet__title">{t("appPracticeEditMap.title")}</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--t-muted-light)" }}>
            {t("appPracticeEditMap.hint")}
          </p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <div className="mt-5">
                {rows.map((r) =>
                  r.kind === "head" ? (
                    <HeadRow key={r.key} row={r} onRename={(v) => setRows((cur) => renameAct(cur, r.key, v))} />
                  ) : (
                    <SceneRow
                      key={r.key}
                      row={r}
                      acts={acts}
                      onRename={(v) => setRows((cur) => renameScene(cur, r.scene.id, v))}
                      onMove={(v) => move(r.scene.id, v)}
                      onDelete={() => {
                        if (window.confirm(t("appPracticeEditMap.confirmDelete", { name: r.scene.title }))) {
                          setRows((cur) => removeScene(cur, r.scene.id));
                        }
                      }}
                    />
                  ),
                )}
              </div>
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={() => {
              const name = window.prompt(t("appPracticeEditMap.newHeadingPrompt"));
              if (name?.trim()) setRows((cur) => addAct(cur, name));
            }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
          >
            <IconPlus className="h-3.5 w-3.5" />
            {t("appPracticeEditMap.addHeading")}
          </button>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => close(false)}
              className="inline-flex h-10 items-center rounded-full px-4 text-sm text-foreground transition-colors hover:bg-muted"
            >
              {t("appPracticeEditMap.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? t("appPracticeEditMap.saving") : t("appPracticeEditMap.save")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A heading: not dragged itself (scenes move past it), renamed in place. */
function HeadRow({ row, onRename }: { row: Extract<LayoutRow, { kind: "head" }>; onRename: (v: string) => void }) {
  const t = useT();
  const { setNodeRef, transform, transition } = useSortable({ id: row.key, disabled: true });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="pb-1 pt-5">
      <InlineName
        value={row.act}
        label={t("appPracticeEditMap.rename", { name: row.act })}
        onCommit={onRename}
        className="w-full bg-transparent text-[11px] font-bold uppercase tracking-[0.14em] text-primary outline-none"
      />
    </div>
  );
}

function SceneRow({
  row,
  acts,
  onRename,
  onMove,
  onDelete,
}: {
  row: Extract<LayoutRow, { kind: "scene" }>;
  acts: string[];
  onRename: (v: string) => void;
  onMove: (v: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const name = row.scene.title;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 border-b py-2"
    >
      <button
        type="button"
        aria-label={t("appPracticeEditMap.drag", { name })}
        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical className="h-4 w-4" />
      </button>
      <InlineName
        value={name}
        label={t("appPracticeEditMap.rename", { name })}
        onCommit={onRename}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none"
      />
      <select
        aria-label={t("appPracticeEditMap.moveTo")}
        value={row.scene.act ?? NO_HEADING}
        onChange={(e) => onMove(e.target.value)}
        className="max-w-[9rem] shrink-0 truncate rounded-md border bg-transparent px-2 py-1 text-xs text-muted-foreground"
      >
        {acts.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        <option value={NO_HEADING}>{t("appPracticeEditMap.noHeading")}</option>
        <option value={NEW_HEADING}>{t("appPracticeEditMap.newHeading")}</option>
      </select>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t("appPracticeEditMap.delete", { name })}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
      >
        <IconTrash className="h-4 w-4" />
      </button>
    </div>
  );
}

/** A name you click into and type over; Enter or leaving the field keeps it, Escape puts it back. */
function InlineName({
  value,
  label,
  onCommit,
  className,
}: {
  value: string;
  label: string;
  onCommit: (v: string) => void;
  className: string;
}) {
  const [text, setText] = useState(value);
  // A name changed from outside (a merge, a reset) is taken up as it renders.
  const [was, setWas] = useState(value);
  if (was !== value) {
    setWas(value);
    setText(value);
  }
  const commit = () => {
    if (text.trim() && text !== value) onCommit(text);
    else setText(value);
  };
  return (
    <input
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Puts the name back; the dialog stays open.
          e.stopPropagation();
          setText(value);
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}
