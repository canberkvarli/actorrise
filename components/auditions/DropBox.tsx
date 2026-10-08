"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { browserTz, changedFields, type AuditionQuota, type Draft } from "@/lib/auditions";
import { markCalendarOffer } from "@/lib/calendarFeed";
import { uploadSides, useCreateAudition, useParseBreakdown } from "@/hooks/useAuditions";
import { DraftCard, bodyFromValues, valuesFromDraft, type DraftValues } from "./DraftCard";
import { errMessage } from "./draftValues";

// First person, no dashes. Free and Plus point at /pricing; Pro has nowhere to go.
function QuotaLine({ tier, limit }: { tier: AuditionQuota["tier"]; limit: number }) {
  const all = <>That&apos;s all {limit} of your reads this month. </>;
  if (tier === "pro") return <>{all}They come back next month, and you can fill this one in yourself.</>;
  const next = tier === "plus" ? { to: "Pro", n: 100 } : { to: "Plus", n: 30 };
  return <>{all}<Link href="/pricing" className="underline">{next.to} reads {next.n}</Link> a month, or fill it in yourself below, that&apos;s always free.</>;
}

type Stage = "idle" | "reading" | "card";

const MAX_BYTES = 10 * 1024 * 1024;

/** What the reading line says while the parse runs. It steps every 1.6s and holds on the last. */
export const READING_BEATS = [
  "Reading it.",
  "Finding the date and the room.",
  "Looking for what they want you to bring.",
  "Nearly there.",
] as const;
const BEAT_MS = 1600;

/**
 * The capture box: paste the casting email or drop the sides, and it comes
 * back as a draft ticket. `hero` is the empty page's centrepiece; `compact`
 * sits at the top of the rail once there are tickets. Same three states
 * (idle, a PDF dragged over it, reading) in both.
 */
export function DropBox({
  source = "parse",
  startOpen = false,
  size = "hero",
  firstOne = false,
}: {
  source?: "parse" | "onboarding";
  startOpen?: boolean;
  size?: "hero" | "compact";
  /** The rail is empty: whatever saves here is their first audition. */
  firstOne?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<Stage>(startOpen ? "card" : "idle");
  const [beat, setBeat] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(startOpen);
  const [quotaHit, setQuotaHit] = useState<Pick<AuditionQuota, "tier" | "limit"> | null>(null);
  const [parsedOk, setParsedOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // Each read gets a number; "stop" moves the number on, so a reply that
  // arrives afterwards finds itself stale and is dropped.
  const run = useRef(0);
  const scriptId = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const pasteId = useId();
  const parse = useParseBreakdown();
  const create = useCreateAudition();
  const compact = size === "compact";
  // "stop" hands focus back to the paste, once the textarea is back on screen.
  const refocus = useRef(false);
  useEffect(() => {
    if (stage !== "idle" || !refocus.current) return;
    refocus.current = false;
    area.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (stage !== "reading") return;
    setBeat(0);
    const t = window.setInterval(() => {
      setBeat((b) => {
        if (b + 1 >= READING_BEATS.length - 1) window.clearInterval(t);
        return Math.min(b + 1, READING_BEATS.length - 1);
      });
    }, BEAT_MS);
    return () => window.clearInterval(t);
  }, [stage]);

  function acceptFile(f: File | null | undefined): File | null {
    if (!f) return null;
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.message("Sides need to be a PDF.");
      return null;
    }
    if (f.size > MAX_BYTES) {
      toast.message("That PDF is over 10MB. Try a smaller one.");
      return null;
    }
    setFile(f);
    scriptId.current = null;
    return f;
  }

  async function read(withFile: File | null = file) {
    if (quotaHit) return;
    if (!text.trim() && !withFile) return void area.current?.focus();
    const mine = ++run.current;
    setStage("reading");
    try {
      const res = await parse.mutateAsync({ text: text.trim(), file: withFile, tz: browserTz() });
      if (mine !== run.current) return;
      setDraft(res.draft);
      setParsedOk(res.ok);
      setManual(false);
      if (!res.ok) toast.message("I couldn't read that one. Fill it in and I'll keep your text in the notes.");
    } catch (e) {
      if (mine !== run.current) return;
      const err = e as Error & { detail?: { error?: string; quota?: AuditionQuota } };
      if (err.detail?.error === "audition_parse_quota") setQuotaHit({ tier: err.detail.quota?.tier ?? "free", limit: err.detail.quota?.limit ?? 5 });
      else toast.error(errMessage(e));
      setDraft(null);
      setParsedOk(false);
      setManual(true);
    }
    setStage("card");
  }

  // Back to the box with the paste and the sides still in it. The request
  // itself carries on server side; its answer is simply not waited for.
  function stop() {
    run.current++;
    refocus.current = true;
    setStage("idle");
  }

  async function save(v: DraftValues) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...bodyFromValues(v), tz: browserTz(), source: manual ? (source === "onboarding" ? "onboarding" : "manual") : source };
      if (file) {
        if (scriptId.current == null) scriptId.current = await uploadSides(file);
        if (scriptId.current != null) body.user_script_id = scriptId.current;
        else toast.message("Your audition is saved, but the sides didn't load. You can upload them in ScenePartner.");
      }
      const parsed = draft && !manual && parsedOk ? draft : null;
      if (parsed?.material && v.material_raw === valuesFromDraft(parsed).material_raw) body.material = parsed.material;
      const a = await create.mutateAsync(body);
      if (parsed) {
        const fields = changedFields(valuesFromDraft(parsed) as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>);
        if (fields.length) trackEvent("audition_parse_corrected", { fields: fields.join(",") });
      }
      if (firstOne) markCalendarOffer(a.id);
      reset();
      router.push(`/auditions/${a.id}`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function reset() {
    setText("");
    setFile(null);
    scriptId.current = null;
    setDraft(null);
    setParsedOk(false);
    setStage("idle");
    setManual(false);
  }

  // Cancel goes back to the box with the paste and the sides still in it.
  function cancel() {
    setDraft(null);
    setParsedOk(false);
    setStage("idle");
    setManual(false);
  }

  if (stage === "card") {
    return (
      <>
        {quotaHit && (
          <p role="status" className="aud-muted mb-2 text-sm"><QuotaLine {...quotaHit} /></p>
        )}
        <DraftCard
          draft={manual ? null : draft}
          sidesName={file?.name ?? null}
          saving={saving}
          initialNotes={manual || !parsedOk ? text.trim().slice(0, 4000) : ""}
          onSave={save}
          onCancel={cancel}
        />
      </>
    );
  }

  const reading = stage === "reading";
  const dragging = over && !reading;

  return (
    <div>
      <form
        className="aud-cap"
        data-size={size}
        aria-busy={reading}
        onSubmit={(e) => { e.preventDefault(); read(); }}
        onDragEnter={(e) => { e.preventDefault(); if (!reading) setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); if (!reading && !over) setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (reading) return;
          const f = acceptFile(e.dataTransfer.files?.[0]);
          if (f && !quotaHit) read(f);
        }}
      >
        {reading ? (
          <div role="status" aria-live="polite" className={`flex flex-col justify-center ${compact ? "min-h-[176px] gap-3.5 px-4 py-5" : "min-h-[240px] gap-[18px] px-[26px] py-7"}`}>
            <div className="flex items-center gap-4">
              <LampSketch size={compact ? 36 : 48} />
              <p key={beat} className={`aud-beat aud-hero-dir ${compact ? "text-[22px]" : "text-[28px]"} leading-[1.1]`}>{READING_BEATS[beat]}</p>
            </div>
            <div className="aud-track" aria-hidden="true"><span /></div>
            <div className="aud-cap-muted flex justify-between gap-3 text-sm">
              <span>Usually a few seconds.</span>
              <button type="button" className="aud-link aud-focus" onClick={stop}>stop</button>
            </div>
          </div>
        ) : dragging ? (
          <div className={`aud-dropzone flex flex-col items-center justify-center gap-2 p-6 text-center ${compact ? "min-h-[176px]" : "min-h-[220px]"}`}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="aud-brand-ink">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            <p className={`aud-hero-dir ${compact ? "text-[24px]" : "text-[30px]"} leading-[1.1]`}>Let go. I&apos;ll read it.</p>
            <p className="aud-cap-muted text-sm">A breakdown or sides, as a PDF.</p>
          </div>
        ) : (
          <>
            <label htmlFor={pasteId} className="sr-only">Casting email or breakdown</label>
            <textarea
              ref={area}
              id={pasteId}
              rows={compact ? 3 : 5}
              placeholder="Paste it here. The whole email is fine, signature and all."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className={`aud-cap-row flex flex-wrap items-center gap-x-4 gap-y-3 ${compact ? "py-3 pl-4 pr-3" : "py-3.5 pl-[22px] pr-3.5"}`}>
              <span className="aud-cap-muted flex min-w-0 flex-[1_1_220px] items-center gap-2.5 text-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
                </svg>
                {file ? (
                  <span className="min-w-0">
                    <span className="aud-cap-strong break-all">{file.name}</span>{" "}
                    <button type="button" className="aud-link aud-focus" onClick={() => { setFile(null); scriptId.current = null; }}>
                      take it off
                    </button>
                  </span>
                ) : (
                  <span>
                    Drop the breakdown or sides PDF, or{" "}
                    <button type="button" className="aud-link aud-cap-strong aud-focus" onClick={() => fileInput.current?.click()}>
                      choose a file
                    </button>
                  </span>
                )}
              </span>
              <button
                type="submit"
                disabled={!!quotaHit}
                className={`aud-pill aud-focus ml-auto bg-primary text-primary-foreground ${compact ? "h-10 px-5 text-[15px]" : "h-12 px-6 text-base"} disabled:opacity-50`}
              >
                Read it
              </button>
              <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" tabIndex={-1} onChange={(e) => {
                  // Same as a drop: a good PDF starts reading straight away.
                  const f = acceptFile(e.target.files?.[0]);
                  e.target.value = "";
                  if (f && !quotaHit) read(f);
                }} />
            </div>
          </>
        )}
      </form>
      {quotaHit && (
        <p role="status" className="aud-cap-muted mt-3 text-sm">
          <QuotaLine {...quotaHit} />
        </p>
      )}
      <div className={compact ? "mt-3" : "mt-5 text-center"}>
        <button
          type="button"
          className={`aud-link aud-cap-muted aud-focus font-medium ${compact ? "text-sm" : "text-[15px]"}`}
          onClick={() => { setManual(true); setStage("card"); }}
        >
          or fill it in yourself
        </button>
      </div>
    </div>
  );
}

/** The small ghost light from round 1, lit while I read. */
function LampSketch({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="aud-lamp shrink-0 overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="16" r="15" className="aud-lamp-glow" stroke="none" />
      <path d="M24 16 A8 8 0 1 1 40 16 A8 8 0 1 1 24 16" />
      <path d="M29 18 L31 13 L33 18 L35 13" className="aud-lamp-lit" />
      <path d="M28 23 L28 27 C28 28.5 36 28.5 36 27 L36 23 M32 28 L32 48" />
      <path d="M32 48 L21 58 M32 48 L43 58 M32 48 L32 58" />
      <path d="M13 16 L18 16 M51 16 L46 16 M18 4 L21.5 7.5 M46 4 L42.5 7.5" className="aud-lamp-lit aud-lamp-rays" />
    </svg>
  );
}
