"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical, IconPencil, IconTrash } from "@tabler/icons-react";
import type { Credit } from "@/types/resume";
import { CREDIT_CATEGORIES, CATEGORY_HEADING } from "@/types/resume";

const CONTAINER_PREFIX = "container:";
const containerId = (cat: string) => `${CONTAINER_PREFIX}${cat}`;

function CreditRow({
  credit,
  onEdit,
  onDelete,
  overlay,
}: {
  credit: Credit;
  onEdit?: (c: Credit) => void;
  onDelete?: (id: number) => void;
  overlay?: boolean;
}) {
  const sortable = useSortable({ id: credit.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      className={`flex items-center gap-2 border border-border bg-background px-2.5 py-2 ${
        overlay ? "shadow-lg shadow-black/20" : ""
      }`}
    >
      <button
        type="button"
        aria-label="Drag to reorder or move category"
        className="shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing [&_svg]:size-4"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical />
      </button>
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-foreground">{credit.production}</span>
        {credit.role ? <span className="text-muted-foreground"> · {credit.role}</span> : null}
        {(credit.company || credit.director || credit.year) && (
          <div className="truncate text-xs text-muted-foreground">
            {[credit.company, credit.director, credit.year].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      {!overlay && (
        <>
          <button
            type="button"
            onClick={() => onEdit?.(credit)}
            aria-label="Edit"
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground [&_svg]:size-4"
          >
            <IconPencil />
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(credit.id)}
            aria-label="Delete"
            className="shrink-0 p-1 text-muted-foreground hover:text-destructive [&_svg]:size-4"
          >
            <IconTrash />
          </button>
        </>
      )}
    </div>
  );
}

function CategoryColumn({
  catId,
  rows,
  dragging,
  onEdit,
  onDelete,
}: {
  catId: string;
  rows: Credit[];
  dragging: boolean;
  onEdit: (c: Credit) => void;
  onDelete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId(catId) });
  // Hide empty categories unless a drag is in progress (then they're drop targets).
  if (rows.length === 0 && !dragging) return null;
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {CATEGORY_HEADING[catId]}
        {rows.length > 0 && <span className="text-muted-foreground/60">{rows.length}</span>}
      </h3>
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`mt-2 space-y-1.5 ${
            rows.length === 0
              ? `min-h-11 border border-dashed ${isOver ? "border-primary bg-primary/5" : "border-border"}`
              : ""
          }`}
        >
          {rows.length === 0 ? (
            <p className="px-2 py-2.5 text-xs text-muted-foreground">Drop here</p>
          ) : (
            rows.map((c) => (
              <CreditRow key={c.id} credit={c} onEdit={onEdit} onDelete={onDelete} />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

export default function CreditsBoard({
  credits,
  setCredits,
  onEdit,
  onDelete,
  onPersist,
}: {
  credits: Credit[];
  setCredits: (updater: (prev: Credit[]) => Credit[]) => void;
  onEdit: (c: Credit) => void;
  onDelete: (id: number) => void;
  onPersist: (moved: { id: number; category: string } | null) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [startCat, setStartCat] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeCredit = useMemo(
    () => credits.find((c) => c.id === activeId) || null,
    [credits, activeId]
  );

  const catOf = (id: UniqueIdentifier | undefined): string | null => {
    if (id == null) return null;
    if (typeof id === "string" && id.startsWith(CONTAINER_PREFIX)) {
      return id.slice(CONTAINER_PREFIX.length);
    }
    return credits.find((c) => c.id === Number(id))?.category ?? null;
  };

  // Rebuild the flat list grouped by canonical category order, placing `moved`
  // into targetCat (before `beforeId`, or at the end).
  const regroup = (
    without: Credit[],
    moved: Credit,
    targetCat: string,
    beforeId: number | null
  ): Credit[] => {
    const out: Credit[] = [];
    for (const { id: cat } of CREDIT_CATEGORIES) {
      const group = without.filter((c) => c.category === cat);
      if (cat === targetCat) {
        if (beforeId == null) group.push(moved);
        else {
          const idx = group.findIndex((c) => c.id === beforeId);
          if (idx < 0) group.push(moved);
          else group.splice(idx, 0, moved);
        }
      }
      out.push(...group);
    }
    return out;
  };

  const handleDragStart = (e: DragStartEvent) => {
    const id = Number(e.active.id);
    setActiveId(id);
    setStartCat(catOf(e.active.id));
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeCat = catOf(active.id);
    const overCat = catOf(over.id);
    if (!activeCat || !overCat || activeCat === overCat) return;
    // Move the active credit into the category it's now hovering.
    setCredits((prev) => {
      const activeC = prev.find((c) => c.id === Number(active.id));
      if (!activeC) return prev;
      const without = prev.filter((c) => c.id !== activeC.id);
      const moved = { ...activeC, category: overCat };
      const overIsContainer =
        typeof over.id === "string" && over.id.startsWith(CONTAINER_PREFIX);
      return regroup(without, moved, overCat, overIsContainer ? null : Number(over.id));
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const movedId = Number(active.id);
    const finalCat = catOf(active.id);
    // Reorder within the same category if dropped on a sibling.
    if (over && !String(over.id).startsWith(CONTAINER_PREFIX)) {
      const overCat = catOf(over.id);
      if (finalCat && finalCat === overCat && movedId !== Number(over.id)) {
        setCredits((prev) => {
          const group = prev.filter((c) => c.category === finalCat);
          const oldIdx = group.findIndex((c) => c.id === movedId);
          const newIdx = group.findIndex((c) => c.id === Number(over.id));
          const newGroup = arrayMove(group, oldIdx, newIdx);
          return CREDIT_CATEGORIES.flatMap(({ id: cat }) =>
            cat === finalCat ? newGroup : prev.filter((c) => c.category === cat)
          );
        });
      }
    }
    const changedCategory =
      startCat && finalCat && finalCat !== startCat ? { id: movedId, category: finalCat } : null;
    setActiveId(null);
    setStartCat(null);
    onPersist(changedCategory);
  };

  const dragging = activeId != null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setStartCat(null);
      }}
    >
      <div className="space-y-6">
        {CREDIT_CATEGORIES.map(({ id: cat }) => (
          <CategoryColumn
            key={cat}
            catId={cat}
            rows={credits.filter((c) => c.category === cat)}
            dragging={dragging}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCredit ? <CreditRow credit={activeCredit} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
