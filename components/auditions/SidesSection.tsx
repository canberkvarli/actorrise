"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { trackEvent } from "@/lib/events";
import type { Audition, AuditionPiece } from "@/lib/auditions";
import { uploadSides, useAddPiece, useAssist, useRemovePiece, useUpdateAudition } from "@/hooks/useAuditions";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useScript } from "@/hooks/useScripts";
import { useLocale, useT } from "@/lib/i18n";
import { SidesReader } from "./SidesReader";

/** Casting sent sides that aren't here yet: take the PDF, attach it, it loads into ScenePartner. */
export function useAddSides(a: Audition) {
  const update = useUpdateAudition();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const id = await uploadSides(file);
    if (id == null) {
      setBusy(false);
      toast.error(t("appAuditionsSides.didntLoad"));
      return;
    }
    update.mutate({ id: a.id, user_script_id: id }, {
      onSuccess: () => toast.success(t("appAuditionsSides.gotThem")),
      onError: () => toast.error(t("appAuditionsErr.saveFailed")),
      onSettled: () => setBusy(false),
    });
  }
  const field = (
    <input
      ref={input}
      type="file"
      accept="application/pdf"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        void take(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  return { busy, pick: () => input.current?.click(), field };
}

/** Two halves of the excerpt, split on a blank line near the middle, so the sides read as two pages. */
function pages(text: string): [string, string] {
  const mid = Math.floor(text.length / 2);
  const cut = text.indexOf("\n\n", mid - 120);
  const at = cut > 0 && cut < mid + 200 ? cut : mid;
  return [text.slice(0, at).trim(), text.slice(at).trim()];
}

function runsNote(a: Audition, t: ReturnType<typeof useT>, tag: string): string | null {
  const runs = a.prep?.runs ?? 0;
  if (!runs) return t("appAuditionsSides.notRun");
  const last = a.prep?.last_run_at
    ? new Date(a.prep.last_run_at).toLocaleDateString(tag, { weekday: "long" })
    : null;
  const ran = runs === 1 ? t("appAuditionsSides.runOnce") : runs === 2 ? t("appAuditionsSides.runTwice") : t("appAuditionsSides.runTimes", { n: runs });
  return last ? t("appAuditionsSides.lastOn", { runs: ran, day: last }) : ran;
}

/** Their sides as paper, my read on the scene, or what they asked you to bring of your own. */
export function SidesSection({ a }: { a: Audition }) {
  const t = useT();
  const tag = useLocale() === "tr" ? "tr-TR" : "en-US";
  const steps = a.prep?.steps ?? [];
  const sidesStep = steps.find((s) => s.key === "sides");
  const upload = steps.find((s) => s.key === "upload");
  const piece = steps.find((s) => s.key === "piece");
  const { data: script } = useScript(a.user_script_id);
  const status = script?.processing_status ?? a.sides?.status ?? null;
  const loading = status === "processing" || status === "pending";
  const add = useAddSides(a);
  const [reading, setReading] = useState(false);

  // The sides finish reading in while the page is open: fetch the audition
  // again so the pages appear here without a reload.
  const qc = useQueryClient();
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current && status === "completed") void qc.invalidateQueries({ queryKey: ["auditions"] });
    wasLoading.current = loading;
  }, [loading, status, qc]);

  // A read on the scene once the sides have loaded (or, with none, only what to wear).
  const assist = useAssist();
  const asked = useRef<string | null>(null);
  const canRead = (a.user_script_id ? status === "completed" : !!(a.role || a.material_raw)) && a.scope === "upcoming";
  const key = `${a.id}|${a.user_script_id}|${status}`;
  useEffect(() => {
    if (!canRead || asked.current === key) return;
    asked.current = key;
    assist.mutate({ id: a.id, part: "read" });
  }, [canRead, key, a.id, assist]);
  const read = a.assist.read?.line;

  const title = sidesStep || upload ? t("appAuditionsSides.theirSides") : piece ? t("appAuditionsSides.yourPiece") : t("appAuditionsSides.bringing");
  const excerpt = a.sides?.excerpt;

  return (
    <section id="aud-sides" aria-labelledby="aud-sides-h">
      <div className="aud-sec-head">
        <h2 id="aud-sides-h" className="aud-sec-title text-[26px]">{title}</h2>
        {sidesStep && <span className="aud-cap-muted text-[13px]">{loading ? t("appAuditionsSides.stillLoading") : runsNote(a, t, tag)}</span>}
      </div>

      {sidesStep && (
        <>
          {excerpt ? (
            <button
              type="button"
              className="aud-pages aud-focus grid w-full gap-3.5 text-left sm:grid-cols-2"
              aria-label={t("appAuditionsSides.readYourSides")}
              onClick={() => setReading(true)}
            >
              {pages(excerpt).map((p, i) => p && (
                <span key={i} className={`aud-page block h-[150px] px-4 py-3.5 text-[12px] leading-[1.55] ${i ? "max-sm:hidden" : ""}`} data-tilt={i ? "r" : "l"}>
                  {p}
                </span>
              ))}
              <span className="aud-pages-cue" aria-hidden>{t("appAuditionsSides.readThem")}</span>
            </button>
          ) : (
            <p className="aud-pencil-muted text-[18px]">
              {loading ? t("appAuditionsSides.loadingIn") : status === "failed" ? t("appAuditionsSides.failed") : t("appAuditionsSides.attached", { title: a.sides?.title ?? t("appAuditionsSides.yourSides") })}
            </p>
          )}
          {(read || (assist.isPending && !read)) && (
            <div className="aud-card mt-4 px-4 py-3.5">
              {read ? (
                <p className="aud-pencil text-[19px] leading-snug">{read}</p>
              ) : (
                <p className="aud-pencil-muted aud-thinking text-[18px]" role="status">{t("appAuditionsSides.readingScene")}</p>
              )}
              <p className="aud-cap-muted mt-2 text-[12.5px]">{t("appAuditionsSides.readNote")}</p>
            </div>
          )}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
            {(excerpt || status === "completed") && (
              <button type="button" className="aud-link font-semibold" onClick={() => setReading(true)}>
                {t("appAuditionsSides.readHere")}
              </button>
            )}
            <Link
              href={sidesStep.href!}
              className="aud-link"
              onClick={() => trackEvent("audition_prep_started", { audition_id: a.id, kind: "sides" })}
            >
              {t("appAuditionsSides.runWith")}
            </Link>
            <button type="button" className="aud-link aud-cap-muted" disabled={add.busy} onClick={add.pick}>
              {add.busy ? t("appAuditionsSides.swapping") : t("appAuditionsSides.swap")}
            </button>
            {add.field}
          </p>
          <SidesReader a={a} open={reading} onOpenChange={setReading} runHref={sidesStep.href ?? undefined} />
        </>
      )}

      {upload && (
        <div className="aud-card flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <p className="aud-pencil-muted text-[18px]">{t("appAuditionsSides.uploadAsk")}</p>
          <button type="button" disabled={add.busy} onClick={add.pick} className="aud-quiet-chip aud-focus px-4 py-2 text-[14px] font-semibold">
            {add.busy ? t("appAuditionsSides.addingThem") : t("appAuditionsSides.addPdf")}
          </button>
          {add.field}
        </div>
      )}

      {piece && (
        <div className={sidesStep || upload ? "mt-6" : ""}>
          <p className="text-[16px]">
            {t("appAuditionsSides.theyWantA")}<span className="aud-pencil text-[19px]">{a.material_raw ?? t("appAuditionsSides.yourChoice")}</span>{t("appAuditionsSides.theyWantB")}
          </p>
          <Pieces a={a} />
          <p className="mt-2 text-[14px]">
            <Link
              href={piece.href!}
              className="aud-link"
              onClick={() => trackEvent("audition_prep_started", { audition_id: a.id, kind: "monologue" })}
            >
              {t("appAuditionsSides.findOne")}
            </Link>
          </p>
        </div>
      )}

      {!sidesStep && !upload && !piece && (
        <>
          <p className="aud-pencil-muted text-[18px]">{t("appAuditionsSides.nothing")}</p>
          <Pieces a={a} />
        </>
      )}
      {!piece && (sidesStep || upload) && a.pieces.length > 0 && (
        <div className="mt-5"><Pieces a={a} label={t("appAuditionsSides.alsoBringing")} /></div>
      )}
    </section>
  );
}

function pieceName(p: AuditionPiece, t: ReturnType<typeof useT>): string {
  if (!p.monologue_id) return t("appAuditionsSides.aScene");
  if (!p.title) return t("appAuditionsSides.aMonologue");
  return p.character && !p.title.includes(p.character) ? `${p.title}, ${p.character}` : p.title;
}

/** The pieces on this audition, and one tap to add one the actor saved. */
function Pieces({ a, label }: { a: Audition; label?: string }) {
  const add = useAddPiece();
  const remove = useRemovePiece();
  const t = useT();
  const { data: saved } = useBookmarks();
  const attached = new Set(a.pieces.map((p) => p.monologue_id));
  const choices = (saved ?? []).filter((m) => !attached.has(m.id));
  if (a.pieces.length === 0 && choices.length === 0) return null;

  return (
    <div className="mt-3">
      {label && <p className="aud-eyebrow mb-1.5">{label}</p>}
      {a.pieces.length > 0 && (
        <ul className="grid gap-1.5">
          {a.pieces.map((p) => (
            <li key={p.id} className="aud-tick-row flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[15px]">
              <span className="min-w-0 break-words">
                {pieceName(p, t)}
                {p.play_title && <span className="aud-cap-muted">{t("appAuditionsSides.from", { play: p.play_title })}</span>}
              </span>
              {p.monologue_id && (
                <Link
                  href={`/monologue/${p.monologue_id}/work`}
                  onClick={() => trackEvent("audition_prep_started", { audition_id: a.id, kind: "monologue" })}
                  className="aud-link text-[13.5px]"
                >
                  {t("appAuditionsSides.workOn")}
                </Link>
              )}
              <button
                type="button"
                className="aud-link aud-cap-muted text-[13.5px]"
                disabled={remove.isPending}
                aria-label={t("appAuditionsSides.takeOffLabel", { name: pieceName(p, t) })}
                onClick={() => remove.mutate({ id: a.id, piece_id: p.id }, { onError: () => toast.error(t("appAuditionsErr.saveFailed")) })}
              >
                {t("appAuditionsSides.takeOff")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {choices.length > 0 && (
        <select
          className="aud-input mt-2 max-w-full px-2.5 py-2 text-[14px]"
          aria-label={t("appAuditionsSides.bringSaved")}
          value=""
          disabled={add.isPending}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (!id) return;
            add.mutate({ id: a.id, monologue_id: id }, {
              onSuccess: () => toast.success(t("appAuditionsSides.savedPicked")),
              onError: () => toast.error(t("appAuditionsErr.saveFailed")),
            });
          }}
        >
          <option value="">{a.pieces.length ? t("appAuditionsSides.addAnother") : t("appAuditionsSides.pickSaved")}</option>
          {choices.map((m) => (
            <option key={m.id} value={m.id}>
              {m.character_name}, {m.play_title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
