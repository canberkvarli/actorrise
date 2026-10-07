"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { browserTz, changedFields, type Draft } from "@/lib/auditions";
import { uploadSides, useCreateAudition, useParseBreakdown } from "@/hooks/useAuditions";
import { DraftCard, bodyFromValues, valuesFromDraft, type DraftValues } from "./DraftCard";

type Stage = "idle" | "reading" | "card";

export function DropBox({ source = "parse", startOpen = false }: { source?: "parse" | "onboarding"; startOpen?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<Stage>(startOpen ? "card" : "idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(startOpen);
  const [quotaHit, setQuotaHit] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const parse = useParseBreakdown();
  const create = useCreateAudition();

  async function read() {
    if (!text.trim() && !file) return;
    setStage("reading");
    try {
      const res = await parse.mutateAsync({ text: text.trim(), file, tz: browserTz() });
      setDraft(res.draft);
      setManual(false);
      if (!res.ok) toast.message("I couldn't read that one. Fill it in and I'll keep your text in the notes.");
    } catch (e) {
      const err = e as Error & { detail?: { error?: string } };
      if (err.detail?.error === "audition_parse_quota") {
        setQuotaHit(true);
        toast.message("That's your 5 free reads this month. Fill this one in by hand, or go Plus for unlimited.");
      } else {
        toast.error(err.message);
      }
      setDraft(null);
      setManual(true);
    }
    setStage("card");
  }

  async function save(v: DraftValues) {
    const body: Record<string, unknown> = { ...bodyFromValues(v), tz: browserTz(), source: manual ? (source === "onboarding" ? "onboarding" : "manual") : source };
    if (file) {
      const scriptId = await uploadSides(file);
      if (scriptId) body.user_script_id = scriptId;
      else toast.message("The sides didn't load into ScenePartner. You can add them from the prep room.");
    }
    if (draft && !manual && draft.material) body.material = draft.material;
    if (draft && !manual) {
      const fields = changedFields(valuesFromDraft(draft) as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>);
      if (fields.length) trackEvent("audition_parse_corrected", { fields: fields.join(",") });
    }
    try {
      const a = await create.mutateAsync(body);
      reset();
      router.push(`/auditions/${a.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function reset() {
    setText("");
    setFile(null);
    setDraft(null);
    setStage("idle");
    setManual(false);
  }

  if (stage === "card") {
    return (
      <DraftCard
        draft={manual ? null : draft}
        sidesName={file?.name ?? null}
        saving={create.isPending}
        onSave={save}
        onCancel={reset}
      />
    );
  }

  return (
    <div
      className="aud-drop p-3"
      data-over={over ? "true" : "false"}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && f.type === "application/pdf") setFile(f);
        else if (f) toast.message("Sides need to be a PDF.");
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
        <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="aud-dir aud-muted ml-auto text-xs underline-offset-2 hover:underline" onClick={() => { setManual(true); setStage("card"); }}>
          or fill it in yourself
        </button>
      </div>
    </div>
  );
}
