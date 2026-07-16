"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconPlus, IconTrash, IconPencil, IconX } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { Credit, CreditInput } from "@/types/resume";
import { CREDIT_CATEGORIES, CATEGORY_HEADING } from "@/types/resume";
import ResumePreview, { type ResumeProfile } from "@/components/resume/ResumePreview";

interface ProfileResp extends ResumeProfile {
  name?: string | null;
}

const EMPTY_FORM: CreditInput = { category: "theatre", production: "", role: "", company: "", director: "", year: "" };

export default function ResumePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileResp | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CreditInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");

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
  }, []);

  const deleteCredit = useCallback(
    async (id: number) => {
      setCredits((cur) => cur.filter((c) => c.id !== id));
      if (editingId === id) resetForm();
      try {
        await api.delete(`/api/resume/credits/${id}`);
      } catch {
        // Best-effort; a stale row will resolve on next load.
      }
    },
    [editingId, resetForm]
  );

  const saveSkills = useCallback(
    async (next: string[]) => {
      setProfile((p) => (p ? { ...p, special_skills: next } : p));
      // POST does a partial update (exclude_unset) so other profile fields are untouched.
      await api.post("/api/profile", { special_skills: next });
    },
    []
  );

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
          {/* Editor skeleton */}
          <div className="space-y-4">
            <div className="h-52 animate-pulse rounded-md border border-border bg-muted/30" />
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded border border-border bg-muted/20" />
              ))}
            </div>
            <div className="h-28 animate-pulse rounded-md border border-border bg-muted/30" />
          </div>
          {/* Paper preview skeleton */}
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
        <p className="font-typewriter text-xs uppercase tracking-widest text-muted-foreground">(your résumé.)</p>
        <h1 className="mt-1 font-sans text-3xl font-semibold text-foreground">Résumé</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your credits and I&apos;ll build the one-pager. Name, stats, and headshot come from your{" "}
          <Link href="/profile" className="underline underline-offset-4 hover:text-foreground">profile</Link>.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-6">
          {/* Add / edit credit */}
          <section className="border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">{editingId != null ? "Edit credit" : "Add a credit"}</h2>
            <div className="mt-3 space-y-2.5">
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {CREDIT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
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
                <Button onClick={submitCredit} disabled={!form.production.trim() || saving} size="sm" className="rounded-full">
                  {editingId != null ? "Save" : (<><IconPlus className="size-4" />Add credit</>)}
                </Button>
                {editingId != null && (
                  <button type="button" onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Existing credits by category */}
          {CREDIT_CATEGORIES.map(({ id }) => {
            const rows = credits.filter((c) => c.category === id);
            if (rows.length === 0) return null;
            return (
              <section key={id}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{CATEGORY_HEADING[id]}</h3>
                <ul className="mt-2 space-y-1.5">
                  {rows.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 border border-border bg-background px-3 py-2">
                      <div className="min-w-0 text-sm">
                        <span className="font-medium text-foreground">{c.production}</span>
                        {c.role ? <span className="text-muted-foreground"> · {c.role}</span> : null}
                        <div className="text-xs text-muted-foreground">
                          {[c.company, c.director, c.year].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => editCredit(c)} aria-label="Edit" className="p-1 text-muted-foreground hover:text-foreground [&_svg]:size-4">
                          <IconPencil />
                        </button>
                        <button type="button" onClick={() => deleteCredit(c.id)} aria-label="Delete" className="p-1 text-muted-foreground hover:text-destructive [&_svg]:size-4">
                          <IconTrash />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {/* Special skills */}
          <section className="border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">Special skills</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(profile?.special_skills || []).map((s) => (
                <span key={s} className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1 text-xs text-foreground">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} aria-label={`Remove ${s}`} className="text-muted-foreground hover:text-foreground [&_svg]:size-3">
                    <IconX />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                placeholder="Dialects, stage combat, singing…"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button onClick={addSkill} disabled={!skillInput.trim()} size="sm" variant="outline" className="rounded-full">Add</Button>
            </div>
          </section>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <ResumePreview profile={previewProfile} credits={credits} email={user?.email} />
          <p className="mt-2 text-center text-xs text-muted-foreground">Download coming next — this is a live preview.</p>
        </div>
      </div>
    </div>
  );
}
