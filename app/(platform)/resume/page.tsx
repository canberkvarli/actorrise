"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Reorder, useDragControls } from "framer-motion";
import {
  IconPlus,
  IconTrash,
  IconPencil,
  IconX,
  IconGripVertical,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { Credit, CreditInput } from "@/types/resume";
import { CREDIT_CATEGORIES, CATEGORY_HEADING } from "@/types/resume";
import ResumePreview, { type ResumeProfile } from "@/components/resume/ResumePreview";

interface ProfileResp extends ResumeProfile {
  name?: string | null;
}

const EMPTY_FORM: CreditInput = {
  category: "theatre",
  production: "",
  role: "",
  company: "",
  director: "",
  year: "",
};

// ── One draggable credit row ────────────────────────────────────────────────
function CreditRow({
  credit,
  onEdit,
  onDelete,
  onDropped,
}: {
  credit: Credit;
  onEdit: (c: Credit) => void;
  onDelete: (id: number) => void;
  onDropped: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={credit}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDropped}
      className="flex items-center gap-2 border border-border bg-background px-2.5 py-2"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label="Drag to reorder"
        className="shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing [&_svg]:size-4"
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
      <button
        type="button"
        onClick={() => onEdit(credit)}
        aria-label="Edit"
        className="shrink-0 p-1 text-muted-foreground hover:text-foreground [&_svg]:size-4"
      >
        <IconPencil />
      </button>
      <button
        type="button"
        onClick={() => onDelete(credit.id)}
        aria-label="Delete"
        className="shrink-0 p-1 text-muted-foreground hover:text-destructive [&_svg]:size-4"
      >
        <IconTrash />
      </button>
    </Reorder.Item>
  );
}

export default function ResumePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileResp | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CreditInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");

  // Keep the latest credits in a ref so the drag-end persist always sends the
  // current order without reading state during render.
  const creditsRef = useRef<Credit[]>([]);
  useEffect(() => {
    creditsRef.current = credits;
  }, [credits]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, c] = await Promise.all([
          api.get<ProfileResp>("/api/profile"),
          api.get<Credit[]>("/api/resume/credits"),
        ]);
        if (cancelled) return;
        setProfile(p.data);
        setCredits(c.data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }, []);

  const submitCredit = useCallback(async () => {
    if (!form.production.trim() || saving) return;
    setSaving(true);
    try {
      if (editingId != null) {
        const res = await api.put<Credit>(`/api/resume/credits/${editingId}`, form);
        setCredits((cur) => cur.map((c) => (c.id === editingId ? res.data : c)));
      } else {
        const res = await api.post<Credit>("/api/resume/credits", form);
        setCredits((cur) => [...cur, res.data]);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  }, [form, editingId, saving, resetForm]);

  const editCredit = useCallback((c: Credit) => {
    setEditingId(c.id);
    setForm({
      category: c.category,
      production: c.production,
      role: c.role || "",
      company: c.company || "",
      director: c.director || "",
      year: c.year || "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const deleteCredit = useCallback(
    async (id: number) => {
      setCredits((cur) => cur.filter((c) => c.id !== id));
      if (editingId === id) resetForm();
      try {
        await api.delete(`/api/resume/credits/${id}`);
      } catch {
        /* best-effort; resolves on next load */
      }
    },
    [editingId, resetForm]
  );

  // Reorder within a category → rebuild the flat list (categories stay in their
  // canonical order); persist on drop.
  const handleReorder = useCallback((categoryId: string, newRows: Credit[]) => {
    setCredits((prev) =>
      CREDIT_CATEGORIES.flatMap((cat) =>
        cat.id === categoryId ? newRows : prev.filter((c) => c.category === cat.id)
      )
    );
  }, []);

  const persistOrder = useCallback(() => {
    api
      .put("/api/resume/credits/reorder", { ordered_ids: creditsRef.current.map((c) => c.id) })
      .catch(() => {});
  }, []);

  // Special skills (partial POST so other profile fields are untouched).
  const saveSkills = useCallback(async (next: string[]) => {
    setProfile((p) => (p ? { ...p, special_skills: next } : p));
    await api.post("/api/profile", { special_skills: next });
  }, []);

  const addSkill = useCallback(() => {
    const s = skillInput.trim();
    if (!s) return;
    const existing = profile?.special_skills || [];
    if (existing.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setSkillInput("");
      return;
    }
    void saveSkills([...existing, s]);
    setSkillInput("");
  }, [skillInput, profile, saveSkills]);

  const removeSkill = useCallback(
    (s: string) => void saveSkills((profile?.special_skills || []).filter((x) => x !== s)),
    [profile, saveSkills]
  );

  const previewProfile: ResumeProfile = useMemo(
    () => ({
      name: profile?.name,
      age_range: profile?.age_range,
      height: profile?.height,
      union_status: profile?.union_status,
      training_background: profile?.training_background,
      special_skills: profile?.special_skills,
      headshot_url: profile?.headshot_url,
    }),
    [profile]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted/60" />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="h-52 animate-pulse rounded-md border border-border bg-muted/30" />
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded border border-border bg-muted/20" />
              ))}
            </div>
            <div className="h-28 animate-pulse rounded-md border border-border bg-muted/30" />
          </div>
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="mx-auto w-full max-w-[8.5in] bg-white p-8 shadow-sm ring-1 ring-black/10">
              <div className="flex items-start justify-between border-b border-neutral-200 pb-5">
                <div className="space-y-2">
                  <div className="h-7 w-48 animate-pulse rounded bg-neutral-200" />
                  <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
                </div>
                <div className="h-24 w-20 animate-pulse bg-neutral-200 ring-1 ring-black/10" />
              </div>
              {[0, 1, 2].map((s) => (
                <div key={s} className="mt-5 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
                  <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-neutral-100" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">Building your preview…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-typewriter text-xs uppercase tracking-widest text-muted-foreground">
          (your résumé.)
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">Résumé</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add credits, drag to reorder. Name, stats, and headshot come from your{" "}
          <Link href="/profile" className="underline underline-offset-4 hover:text-foreground">
            profile
          </Link>
          .
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Builder */}
        <div className="space-y-6">
          {/* Add / edit credit */}
          <section className="border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">
              {editingId != null ? "Edit credit" : "Add a credit"}
            </h2>

            {/* category pills */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CREDIT_CATEGORIES.map((c) => {
                const active = form.category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: c.id }))}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-2.5">
              <input
                value={form.production}
                onChange={(e) => setForm((f) => ({ ...f, production: e.target.value }))}
                placeholder="Production / title *"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder="Role"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="Year"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Company / theatre / network"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={form.director}
                  onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
                  placeholder="Director"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={submitCredit}
                  disabled={!form.production.trim() || saving}
                  size="sm"
                  className="rounded-full"
                >
                  {editingId != null ? "Save" : (<><IconPlus className="size-4" />Add credit</>)}
                </Button>
                {editingId != null && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Credits by category — draggable */}
          {credits.length === 0 ? (
            <p className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No credits yet. Add your first one above.
            </p>
          ) : (
            CREDIT_CATEGORIES.map(({ id }) => {
              const rows = credits.filter((c) => c.category === id);
              if (rows.length === 0) return null;
              return (
                <section key={id}>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_HEADING[id]}
                    <span className="text-muted-foreground/60">{rows.length}</span>
                  </h3>
                  <Reorder.Group
                    axis="y"
                    values={rows}
                    onReorder={(newRows) => handleReorder(id, newRows as Credit[])}
                    className="mt-2 space-y-1.5"
                  >
                    {rows.map((c) => (
                      <CreditRow
                        key={c.id}
                        credit={c}
                        onEdit={editCredit}
                        onDelete={deleteCredit}
                        onDropped={persistOrder}
                      />
                    ))}
                  </Reorder.Group>
                </section>
              );
            })
          )}

          {/* Special skills */}
          <section className="border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">Special skills</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(profile?.special_skills || []).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSkill(s)}
                    aria-label={`Remove ${s}`}
                    className="text-muted-foreground hover:text-foreground [&_svg]:size-3"
                  >
                    <IconX />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="Dialects, stage combat, singing…"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button
                onClick={addSkill}
                disabled={!skillInput.trim()}
                size="sm"
                variant="outline"
                className="rounded-full"
              >
                Add
              </Button>
            </div>
          </section>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <ResumePreview profile={previewProfile} credits={credits} email={user?.email} />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Download coming next — this is a live preview.
          </p>
        </div>
      </div>
    </div>
  );
}
