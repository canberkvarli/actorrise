"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { browserTz, changedFields, type Draft } from "@/lib/auditions";
import { uploadSides, useCreateAudition, useParseBreakdown } from "@/hooks/useAuditions";
import { DraftCard, bodyFromValues, valuesFromDraft, type DraftValues } from "./DraftCard";

type Stage = "idle" | "reading" | "card";

const MAX_BYTES = 10 * 1024 * 1024;

function errMessage(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" && m && m !== "[object Object]" ? m : "That didn't save. Check the fields and try again.";
}

export function DropBox({ source = "parse", startOpen = false }: { source?: "parse" | "onboarding"; startOpen?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<Stage>(startOpen ? "card" : "idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(startOpen);
  const [quotaHit, setQuotaHit] = useState(false);
  const [parsedOk, setParsedOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const scriptId = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const parse = useParseBreakdown();
  const create = useCreateAudition();

  function acceptFile(f: File | null | undefined) {
    if (!f) return;
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return void toast.message("Sides need to be a PDF.");
    if (f.size > MAX_BYTES) return void toast.message("That PDF is over 10MB. Try a smaller one.");
    setFile(f);
    scriptId.current = null;
  }

  async function read() {
    if (!text.trim() && !file) return;
    setStage("reading");
    try {
      const res = await parse.mutateAsync({ text: text.trim(), file, tz: browserTz() });
      setDraft(res.draft);
      setParsedOk(res.ok);
      setManual(false);
      if (!res.ok) toast.message("I couldn't read that one. Fill it in and I'll keep your text in the notes.");
    } catch (e) {
      const err = e as Error & { detail?: { error?: string } };
      if (err.detail?.error === "audition_parse_quota") setQuotaHit(true);
      else toast.error(errMessage(e));
      setDraft(null);
      setParsedOk(false);
      setManual(true);
    }
    setStage("card");
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
        else toast.message("The sides didn't load into ScenePartner. You can add them from the prep room.");
      }
      const parsed = draft && !manual && parsedOk ? draft : null;
      if (parsed?.material && v.material_raw === valuesFromDraft(parsed).material_raw) body.material = parsed.material;
      const a = await create.mutateAsync(body);
      if (parsed) {
        const fields = changedFields(valuesFromDraft(parsed) as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>);
        if (fields.length) trackEvent("audition_parse_corrected", { fields: fields.join(",") });
      }
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
      <DraftCard
        draft={manual ? null : draft}
        sidesName={file?.name ?? null}
        saving={saving}
        initialNotes={manual ? text.trim() : ""}
        onSave={save}
        onCancel={cancel}
      />
    );
  }

  return (
    <div
      className="aud-drop p-3"
      data-over={over ? "true" : "false"}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        acceptFile(e.dataTransfer.files?.[0]);
      }}
    >
      <p className="text-sm"><b>Got one coming up?</b> Paste the casting email or drop the sides.</p>
      <textarea
        rows={stage === "reading" ? 2 : 3}
        className="mt-2 w-full resize-y border border-[var(--t-line-light)] bg-[var(--t-paper)] px-2.5 py-2 text-sm"
        aria-label="Casting email or breakdown"
        placeholder="Paste it here"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={stage === "reading"}
      />
      {quotaHit && (
        <p role="status" className="aud-muted mt-2 text-xs">
          You&apos;re out of free reads this month. Fill it in yourself and it still saves, or go Plus for unlimited reads.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={read}
          disabled={stage === "reading" || quotaHit || (!text.trim() && !file)}
          className="bg-primary text-primary-foreground px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {stage === "reading" ? "Reading it" : "Read it"}
        </button>
        <button type="button" className="aud-dir text-xs underline-offset-2 hover:underline" onClick={() => fileInput.current?.click()}>
          {file ? `Sides: ${file.name}` : "attach sides (PDF)"}
        </button>
        <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="aud-dir aud-muted ml-auto text-xs underline-offset-2 hover:underline" onClick={() => { setManual(true); setStage("card"); }}>
          or fill it in yourself
        </button>
      </div>
    </div>
  );
}
