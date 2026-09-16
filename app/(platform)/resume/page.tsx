"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconX, IconDownload } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import api, { downloadFile } from "@/lib/api";
import { UNION_STATUSES } from "@/lib/profileOptions";
import type { Credit, CreditInput } from "@/types/resume";
import { CREDIT_CATEGORIES } from "@/types/resume";
import ResumePreview, { type ResumeProfile } from "@/components/resume/ResumePreview";
import CreditsBoard from "@/components/resume/CreditsBoard";
import { theatreFontVars } from "@/lib/fonts/theatre";

interface ProfileResp extends ResumeProfile {
  name?: string | null;
  location?: string | null;
}

/* `theatre-stage`, not just `theatre-tokens`. The tokens alone are the LIGHT
   palette: --t-text and friends only flip to cream inside a stage, so on the
   app's dark theme this page rendered ink on ink — the title, every field
   value, every credit title and every skill tag simply were not there, while
   the muted greys survived and made it look like a styling accident rather
   than an invisible layer. The stage also gives the page the same ground the
   rehearsal room and the collection stand on.

   The sheet itself is deliberately NOT part of that: it holds its own paper in
   either theme, because it is a printout. */
const SHELL = `theatre-tokens theatre-stage ${theatreFontVars} container relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8`;

/* Raw <input>/<select>, not the ui primitives, so the 44px touch height is set
   by hand in `.t-field` rather than inherited. */
const FIELD = "t-field";

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
        // Array.isArray, not `|| []`: `||` only catches null/undefined, so any
        // other shape (an error envelope, a paginated object) sails through and
        // blows up at `credits.map` in render — which takes the whole route out
        // via the error boundary rather than degrading to an empty list.
        setCredits(Array.isArray(c.data) ? c.data : []);
      } catch (err) {
        // Was an unhandled rejection: the page just rendered blank with no clue.
        console.error("Error loading resume:", err);
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
      <div className={SHELL}>
        <div aria-hidden>
          <div className="h-3 w-28 animate-pulse rounded bg-muted/50" />
          <div className="mt-3 h-11 w-52 animate-pulse rounded bg-muted/50" />
          <div className="mt-11 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-14">
            <div className="space-y-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded bg-muted/30" />
              ))}
            </div>
            <div className="aspect-[8.5/11] w-full max-w-[8.5in] animate-pulse rounded bg-muted/30" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={SHELL}>
      {/* The head carries the one thing this page exists to produce. It used to
          be a small pill tucked under the sheet with the watermark note beneath
          it — the quietest element on a screen whose entire purpose is to hand
          you a PDF. */}
      <header className="t-resume__head">
        <div className="min-w-0">
          <p className="t-slug">(your résumé.)</p>
          <h1 className="t-resume__title">Résumé</h1>
          <p className="t-resume__note">
            Drag a credit to reorder it, or across to another medium. Your name
            comes off your <Link href="/profile">profile</Link>.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="t-cta t-cta--paper t-cta--stub disabled:opacity-60"
          >
            {downloading ? "Preparing…" : "Download the PDF"}
            <span className="t-cta__dot" aria-hidden>
              <IconDownload className="h-4 w-4" />
            </span>
          </button>
          <p className="t-paper__fine">free downloads carry a small watermark.</p>
        </div>
      </header>

      {/* The document gets the larger half: it is the thing being made. */}
      <div className="mt-11 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-14">
        {/* Builder */}
        <div className="space-y-5">
          {/* Details / header stats */}
          <section className="t-build">
            <h2 className="t-build__head">
              <span>The header</span>
              <span className="t-build__aside">age is left off, on purpose</span>
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1">
              <input
                defaultValue={profile?.height || ""}
                onChange={(e) => patchProfile({ height: e.target.value })}
                onBlur={(e) => saveProfile({ height: e.target.value })}
                placeholder="Height (e.g. 5'9&quot;)"
                className={FIELD}
              />
              <select
                value={profile?.union_status || ""}
                onChange={(e) => {
                  patchProfile({ union_status: e.target.value });
                  saveProfile({ union_status: e.target.value });
                }}
                className={FIELD}
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
                className={FIELD}
              />
              <input
                defaultValue={profile?.eye_color || ""}
                onChange={(e) => patchProfile({ eye_color: e.target.value })}
                onBlur={(e) => saveProfile({ eye_color: e.target.value })}
                placeholder="Eyes"
                className={FIELD}
              />
              <input
                defaultValue={profile?.location || ""}
                onChange={(e) => patchProfile({ location: e.target.value })}
                onBlur={(e) => saveProfile({ location: e.target.value })}
                placeholder="Location (city only)"
                className={`${FIELD} col-span-2`}
              />
            </div>
          </section>

          {/* Add / edit credit */}
          <section className="t-build">
            <h2 className="t-build__head">
              <span>{editingId != null ? "Edit the credit" : "Add a credit"}</span>
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
                    className="t-medium"
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-1">
              <input
                value={form.production}
                onChange={(e) => setForm((f) => ({ ...f, production: e.target.value }))}
                placeholder="Production / title *"
                className={FIELD}
              />
              <div className="grid grid-cols-2 gap-x-5 gap-y-1">
                <input
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder={ROLE_HINT[form.category] || "Role"}
                  className={FIELD}
                />
                <input
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="Year"
                  className={FIELD}
                />
                <input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Company / theatre / network"
                  className={FIELD}
                />
                <input
                  value={form.director}
                  onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
                  placeholder="Director"
                  className={FIELD}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={submitCredit}
                  disabled={!form.production.trim() || saving}
                  className="t-medium disabled:opacity-45"
                  aria-pressed={Boolean(form.production.trim()) || undefined}
                >
                  {editingId != null ? "save it" : "add the credit"}
                </button>
                {editingId != null && (
                  <button type="button" onClick={resetForm} className="t-medium">
                    cancel
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Credits board (drag within + across categories) */}
          {credits.length === 0 ? (
            <p className="t-credit__drop text-center">
              nothing on the board yet.
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
          <section className="t-build">
            <h2 className="t-build__head">
              <span>Special skills</span>
            </h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(profile?.special_skills || []).map((s) => (
                <span key={s} className="t-skill">
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSkill(s)}
                    aria-label={`Remove ${s}`}
                    className="[&_svg]:size-3"
                  >
                    <IconX />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-end gap-3">
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
                className={`${FIELD} flex-1`}
              />
              <button
                type="button"
                onClick={addSkill}
                disabled={!skillInput.trim()}
                className="t-medium mb-1 disabled:opacity-45"
              >
                add
              </button>
            </div>
          </section>
        </div>

        {/* The document. First on a phone: it is what you came to look at, and
            stacked below the whole builder it was a scroll away. */}
        <div className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
          <ResumePreview profile={previewProfile} credits={credits} email={user?.email} />
        </div>
      </div>
    </div>
  );
}
