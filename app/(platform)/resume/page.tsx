"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconPlus, IconX, IconDownload } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import api, { downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { UNION_STATUSES } from "@/lib/profileOptions";
import type { Credit, CreditInput } from "@/types/resume";
import { CREDIT_CATEGORIES } from "@/types/resume";
import ResumePreview, { type ResumeProfile } from "@/components/resume/ResumePreview";
import CreditsBoard from "@/components/resume/CreditsBoard";

interface ProfileResp extends ResumeProfile {
  name?: string | null;
  location?: string | null;
}

const EMPTY_FORM: CreditInput = {
  category: "theatre",
  production: "",
  role: "",
  company: "",
  director: "",
  year: "",
};

// Role-column hint by medium (theatre = character name; screen = billing size).
const ROLE_HINT: Record<string, string> = {
  theatre: "Role (character)",
  film: "Role (Lead / Supporting)",
  tv: "Role (Series Regular / Guest…)",
  commercial: "Role",
  voiceover: "Role",
  other: "Role",
};

export default function ResumePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileResp | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CreditInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [downloading, setDownloading] = useState(false);

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
        /* best-effort */
      }
    },
    [editingId, resetForm]
  );

  // Persist after a drag: read the latest state via an identity updater, PUT the
  // moved credit's new category (if any), then persist the full order.
  const persistAfterDrag = useCallback((moved: { id: number; category: string } | null) => {
    setCredits((prev) => {
      if (moved) {
        const c = prev.find((x) => x.id === moved.id);
        if (c) {
          api
            .put(`/api/resume/credits/${c.id}`, {
              category: c.category,
              production: c.production,
              role: c.role,
              company: c.company,
              director: c.director,
              year: c.year,
            })
            .catch(() => {});
        }
      }
      api
        .put("/api/resume/credits/reorder", { ordered_ids: prev.map((c) => c.id) })
        .catch(() => {});
      return prev;
    });
  }, []);

  // Profile detail fields (partial POST so other fields are untouched).
  const patchProfile = useCallback((patch: Partial<ProfileResp>) => {
    setProfile((p) => (p ? { ...p, ...patch } : p));
  }, []);
  const saveProfile = useCallback((patch: Record<string, unknown>) => {
    api.post("/api/profile", patch).catch(() => {});
  }, []);

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

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFile("/api/resume/download", "resume.pdf");
    } catch {
      /* let them retry */
    } finally {
      setDownloading(false);
    }
  }, [downloading]);

  const previewProfile: ResumeProfile = useMemo(
    () => ({
      name: profile?.name,
      height: profile?.height,
      hair_color: profile?.hair_color,
      eye_color: profile?.eye_color,
      union_status: profile?.union_status,
      location: profile?.location,
      training_background: profile?.training_background,
      special_skills: profile?.special_skills,
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
          </div>
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="mx-auto w-full max-w-[8.5in] bg-white p-8 shadow-sm ring-1 ring-black/10">
              <div className="flex items-start justify-between border-b border-neutral-200 pb-5">
                <div className="space-y-2">
                  <div className="h-7 w-48 animate-pulse rounded bg-neutral-200" />
                  <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
                </div>
              </div>
              {[0, 1, 2].map((s) => (
                <div key={s} className="mt-5 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
                  <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-typewriter text-xs uppercase tracking-widest text-muted-foreground">
          (your résumé.)
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">Résumé</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add credits and drag to reorder — or drag between sections. Your name comes from your{" "}
          <Link href="/profile" className="underline underline-offset-4 hover:text-foreground">
            profile
          </Link>
          .
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Builder */}
        <div className="space-y-6">
          {/* Details / header stats */}
          <section className="border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">Header details</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Standard actor résumé stats. Age is intentionally left off.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <input
                defaultValue={profile?.height || ""}
                onChange={(e) => patchProfile({ height: e.target.value })}
                onBlur={(e) => saveProfile({ height: e.target.value })}
                placeholder="Height (e.g. 5'9&quot;)"
                className={inputCls}
              />
              <select
                value={profile?.union_status || ""}
                onChange={(e) => {
                  patchProfile({ union_status: e.target.value });
                  saveProfile({ union_status: e.target.value });
                }}
                className={inputCls}
              >
                <option value="">Union status</option>
                {UNION_STATUSES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <input
                defaultValue={profile?.hair_color || ""}
                onChange={(e) => patchProfile({ hair_color: e.target.value })}
                onBlur={(e) => saveProfile({ hair_color: e.target.value })}
                placeholder="Hair"
                className={inputCls}
              />
              <input
                defaultValue={profile?.eye_color || ""}
                onChange={(e) => patchProfile({ eye_color: e.target.value })}
                onBlur={(e) => saveProfile({ eye_color: e.target.value })}
                placeholder="Eyes"
                className={inputCls}
              />
              <input
                defaultValue={profile?.location || ""}
                onChange={(e) => patchProfile({ location: e.target.value })}
                onBlur={(e) => saveProfile({ location: e.target.value })}
                placeholder="Location (city only)"
                className={`${inputCls} col-span-2`}
              />
            </div>
          </section>

          {/* Add / edit credit */}
          <section className="border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">
              {editingId != null ? "Edit credit" : "Add a credit"}
            </h2>
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
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder={ROLE_HINT[form.category] || "Role"}
                  className={inputCls}
                />
                <input
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="Year"
                  className={inputCls}
                />
                <input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Company / theatre / network"
                  className={inputCls}
                />
                <input
                  value={form.director}
                  onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
                  placeholder="Director"
                  className={inputCls}
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

          {/* Credits board (drag within + across categories) */}
          {credits.length === 0 ? (
            <p className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No credits yet. Add your first one above.
            </p>
          ) : (
            <CreditsBoard
              credits={credits}
              setCredits={setCredits}
              onEdit={editCredit}
              onDelete={deleteCredit}
              onPersist={persistAfterDrag}
            />
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
                className={`${inputCls} flex-1`}
              />
              <Button onClick={addSkill} disabled={!skillInput.trim()} size="sm" variant="outline" className="rounded-full">
                Add
              </Button>
            </div>
          </section>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <ResumePreview profile={previewProfile} credits={credits} email={user?.email} />
          <div className="mt-3 flex flex-col items-center gap-1">
            <Button onClick={handleDownload} disabled={downloading} size="sm" className="rounded-full">
              <IconDownload className="size-4" />
              {downloading ? "Preparing…" : "Download PDF"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Free downloads include a small watermark.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
