"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconExternalLink } from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import api from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { motion, AnimatePresence } from "framer-motion";
import { GhostLightSketch } from "@/components/brand/sketches";
import { CutEditor } from "@/components/monologue/CutEditor";
import { useSaveNotes } from "@/hooks/useCollectionMeta";
import { useBeats, useSaveBeat } from "@/hooks/useBeats";
import { BeatReader, BEAT_LINE_ATTR } from "@/components/monologue/BeatReader";
import { beatUnits } from "@/lib/beatUnits";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useAuth } from "@/lib/auth";
import { EditMonologueModal } from "@/components/admin/EditMonologueModal";
import type { EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { toast } from "sonner";

import { theatreFontVars } from "@/lib/fonts/theatre";
import { OneSheet } from "@/components/monologue/v2/OneSheet";
import { WorkingBar, type Mode } from "@/components/monologue/v2/WorkingBar";
import { ReadView } from "@/components/monologue/v2/ReadView";
import { SidesSheet } from "@/components/monologue/v2/SidesSheet";
import { MarginRail } from "@/components/monologue/v2/MarginRail";
import { RunBar } from "@/components/monologue/v2/RunBar";
import {
  OthersFromPlay,
  SameRegister,
} from "@/components/monologue/v2/RelatedShelves";
import { useProfileFormData } from "@/hooks/useDashboardData";
import { computeProfileMatch } from "@/lib/profileMatch";
import { estimateDurationSeconds } from "@/lib/estimateDuration";
import { applyCut } from "@/lib/monologueSegments";

/**
 * One piece, three ways of looking at it — with a margin.
 *
 * v1 stacked everything in one 3xl column: the piece, then your notes, then
 * the provenance, then nothing. Every fact about the monologue that wasn't the
 * monologue had to queue up underneath it, which meant the two things an actor
 * decides on — how often a room hears this, and whether to run it — sat below
 * three screens of the speech they were deciding about.
 *
 * So the page is a page now: the piece holds the column, and what's true about
 * it holds the margin beside it. On a phone there is no margin, so the margin's
 * contents fall under the piece and the one action moves to a run bar.
 */

export default function MonologueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** The request came back wrong, as opposed to coming back empty. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [notes, setNotes] = useState("");
  const [memorized, setMemorized] = useState(false);
  const [mode, setMode] = useState<Mode>("read");
  const [textSize, setTextSize] = useState(1);
  const [editMonologueId, setEditMonologueId] = useState<number | null>(null);
  const [editMonologueSaving, setEditMonologueSaving] = useState(false);
  const saveNotes = useSaveNotes();
  const toggleMemorized = useToggleMemorized();

  /* Margin notes. The whole-piece textarea below stays — some things are about
     the piece and not about a line — but the marks that actually get made are
     made against a line, so those live in the reading column itself. */
  const monologueId = monologue?.id ?? 0;
  const { data: beatRows } = useBeats(monologueId, Boolean(user) && !!monologue);
  const saveBeat = useSaveBeat(monologueId);
  const beatMap = useMemo(
    () => new Map((beatRows ?? []).map((b) => [b.segment_index, b.body])),
    [beatRows],
  );
  const units = useMemo(
    () => (monologue ? beatUnits(monologue.text, monologue.text_segments) : []),
    [monologue],
  );

  /* The `your lane` mark, which until now only ever appeared in search results
     — so a finished profile paid off on the list and then went quiet on the
     page the actor actually reads. Same computation, same threshold. */
  const { data: profileData } = useProfileFormData();
  const laneMatch = useMemo(
    () => (monologue ? computeProfileMatch(monologue, profileData) : null),
    [monologue, profileData],
  );
  const inLane = Boolean(laneMatch && laneMatch.score >= 1.5 && laneMatch.reasons.length > 0);

  /* What the margin's "your marks" reads from. The cut is stored as indices
     into monologueSegments(), so the length has to be measured through
     applyCut rather than by slicing the raw text. */
  const fullSeconds =
    monologue?.estimated_duration_seconds ||
    estimateDurationSeconds(monologue?.text ?? "");
  const hasCut =
    monologue?.cut_start_line != null && monologue?.cut_end_line != null;
  const cutSeconds = useMemo(() => {
    if (!monologue || !hasCut) return fullSeconds;
    return estimateDurationSeconds(
      applyCut(monologue.text, monologue.cut_start_line, monologue.cut_end_line),
    );
  }, [monologue, hasCut, fullSeconds]);

  // Saving used to be a silent bookmark: 889 opens produced 45 saves, and the
  // things that turn a save into a working piece (a cut, a note) sat two scrolls
  // down where ~nobody found them. On save we now surface the next step inline,
  // right where the intent is. (Savers return 2.1x more than non-savers.)
  const [justSaved, setJustSaved] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const notesSectionRef = useRef<HTMLElement>(null);
  const [notesState, setNotesState] = useState<"idle" | "saving" | "saved">("idle");
  /** Zero-height marker just above the sticky bar. The bar itself can't be the
   *  scroll target — once it sticks, its own rect stops moving. */
  const anchorRef = useRef<HTMLDivElement>(null);

  /** Platform nav is 65px on mobile / 81px from sm up, plus a little air. */
  const NAV_OFFSET = 96;

  const scrollToStage = () => {
    const el = anchorRef.current;
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET,
      behavior: "smooth",
    });
  };

  /* The bottom textarea, for the note that is about the piece rather than
     about a line. Only the fallback now — see openNote. */
  const scrollToNotes = () => {
    notesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    notesRef.current?.focus();
  };

  const beatsWrapRef = useRef<HTMLDivElement>(null);
  const [openBeat, setOpenBeat] = useState<number | null>(null);

  /**
   * What the note button in the working bar does.
   *
   * It used to call scrollToNotes, which sails past the margin the notes now
   * live in and lands on the box at the foot of the page — the exact trip
   * ("scroll past every line to reach it") that the margin exists to remove.
   *
   * So it opens a line instead, and it opens the line you are looking at: the
   * first one at or below the sticky bar. A note is about the bit you just
   * read, and the bar follows you down the piece, so "here" is the only
   * sensible target. Falls back to the box when there is no margin to write in
   * — signed out, paywalled, or reading in cut/copy.
   */
  const openNote = () => {
    const wrap = beatsWrapRef.current;
    if (!wrap) {
      scrollToNotes();
      return;
    }
    const lines = Array.from(
      wrap.querySelectorAll<HTMLElement>(`[${BEAT_LINE_ATTR}]`),
    );
    if (lines.length === 0) {
      scrollToNotes();
      return;
    }
    const target =
      lines.find((el) => el.getBoundingClientRect().top >= NAV_OFFSET) ??
      lines[lines.length - 1];
    const index = Number(target.getAttribute(BEAT_LINE_ATTR));
    setOpenBeat(Number.isNaN(index) ? 0 : index);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /**
   * Write the note if it differs. Called by the debounce below and again on
   * blur, so an in-flight edit is committed either way; the equality check
   * makes the second call a no-op rather than a duplicate write.
   */
  const flushNotes = useCallback(() => {
    if (!monologue) return;
    if ((notes ?? "") === (monologue.notes ?? "")) return;
    setNotesState("saving");
    saveNotes.mutate(
      { monologueId: monologue.id, notes },
      { onSuccess: () => setNotesState("saved") },
    );
    setMonologue((prev) => (prev ? { ...prev, notes } : prev));
  }, [monologue, notes, saveNotes]);

  /* Autosave a second after you stop typing. Blur alone was losing notes: an
     actor types a beat, taps Rehearse, and the textarea never blurs in a way
     that lands before the route changes. */
  useEffect(() => {
    if (!monologue) return;
    if ((notes ?? "") === (monologue.notes ?? "")) return;
    const t = setTimeout(flushNotes, 1000);
    return () => clearTimeout(t);
  }, [notes, monologue, flushNotes]);

  /* Let "saved" fade rather than sit there claiming a save that has scrolled
     out of relevance. */
  useEffect(() => {
    if (notesState !== "saved") return;
    const t = setTimeout(() => setNotesState("idle"), 2200);
    return () => clearTimeout(t);
  }, [notesState]);

  /**
   * Each mode has its own header — the live cut clock, the copy/print buttons —
   * and if you switch while scrolled into the text, that header opens above the
   * fold and you never see it. So switching brings the top of the stage back.
   */
  const selectMode = (next: Mode) => {
    setMode(next);
    const top = anchorRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < NAV_OFFSET) scrollToStage();
  };

  /** The cut is a mode now, not a panel, so "cut it" means switch and look. */
  const openCut = () => {
    setMode("cut");
    scrollToStage();
  };

  // Discovery, not use: 167 favorites carry 2 cuts and 2 notes, and the
  // database cannot say whether the features are buried or unwanted. Entering
  // cut mode (by any of its buttons) and the first focus of the notes box are
  // the "found it" half of that question; the saves are already recorded.
  useEffect(() => {
    if (mode !== "cut" || !monologue) return;
    trackEvent("cut_editor_opened", { monologue_id: monologue.id, surface: "detail" });
  }, [mode, monologue]);
  const notesFocusedRef = useRef(false);
  const noteNotesFocused = () => {
    if (notesFocusedRef.current || !monologue) return;
    notesFocusedRef.current = true;
    trackEvent("notes_field_focused", { monologue_id: monologue.id });
  };

  useEffect(() => {
    if (params.id) {
      fetchMonologue(params.id as string);
    }
  }, [params.id]);

  const fetchMonologue = async (id: string) => {
    setLoadFailed(false);
    try {
      const response = await api.get<Monologue>(`/api/monologues/${id}`);
      setMonologue(response.data);
      setIsFavorited(response.data.is_favorited);
      setNotes(response.data.notes ?? "");
      setMemorized(Boolean(response.data.memorized));
    } catch (error) {
      const status = (error as Error & { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        notFound();
        return;
      }
      // A timeout, a 500 and a dropped connection are not "this piece does not
      // exist". Saying so sends the actor back to search for something that is
      // sitting right there, and gives them nothing to retry.
      console.error("Error fetching monologue:", error);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!monologue) return;

    try {
      if (isFavorited) {
        await api.delete(`/api/monologues/${monologue.id}/favorite`);
        setIsFavorited(false);
        setJustSaved(false);
      } else {
        await api.post(`/api/monologues/${monologue.id}/favorite`);
        setIsFavorited(true);
        setJustSaved(true);
        // A saved piece is exempt from the wall server-side, so the text we are
        // holding is stale the moment it lands in the collection. Without this
        // the actor saves it and keeps staring at the same teaser.
        if (monologue.paywalled) await fetchMonologue(String(monologue.id));
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const handleToggleMemorized = () => {
    if (!monologue) return;
    const next = !memorized;
    setMemorized(next);
    setMonologue((prev) => (prev ? { ...prev, memorized: next } : prev));
    toggleMemorized.mutate({ monologueId: monologue.id, memorized: next });
    // Marking off-book counts as studying it (spaced-review clock).
    if (next) api.post(`/api/monologues/${monologue.id}/studied`, {}).catch(() => {});
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <Skeleton className="mb-8 h-4 w-16" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-12 w-2/3 rounded-lg" />
        <Skeleton className="mt-4 h-3 w-1/2" />
        <Skeleton className="mt-8 h-10 w-full" />
        <div className="mt-8 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    );
  }

  if (!monologue) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <GhostLightSketch size={72} className="text-muted-foreground/50" />
          <p className="stage-direction text-xs text-muted-foreground/70">
            {loadFailed ? "(the lights went out mid-scene.)" : "(nothing on this hook.)"}
          </p>
          <h2 className="font-brand text-2xl font-medium text-foreground">
            {loadFailed ? "This piece wouldn't load" : "This piece has left the stage"}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {loadFailed
              ? "That's on my end, not yours. The piece is still there."
              : "It may have been taken down since you saved it."}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            {loadFailed && (
              <Button
                onClick={() => {
                  setIsLoading(true);
                  fetchMonologue(params.id as string);
                }}
              >
                Try again
              </Button>
            )}
            <Button
              variant={loadFailed ? "outline" : "default"}
              onClick={() => router.push("/monologues")}
            >
              Back to monologues
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const annotatable = Boolean(user) && !monologue.paywalled && units.length > 0;

  return (
    /* theatre-tokens AND the faces on the same element. Binding the tokens
       without theatreFontVars leaves every `font-family: var(--t-display)`
       resolving to nothing, and the build drops the whole declaration rather
       than falling back — which is how search silently rendered its entire
       theatre surface in Montserrat. */
    <div
      className={`theatre-monologue theatre-tokens ${theatreFontVars} t-m__body min-h-screen pb-40 lg:pb-24`}
    >
      <OneSheet
        monologue={monologue}
        inLane={inLane}
        laneReason={laneMatch?.reasons[0]}
        onBack={() => router.back()}
      />

      <main className="mx-auto w-full max-w-[1000px] px-5 sm:px-6">
        <div ref={anchorRef} aria-hidden />

        <WorkingBar
          mode={mode}
          onModeChange={selectMode}
          readOnly={monologue.paywalled}
          noteCount={beatMap.size}
          hasNotes={Boolean(notes.trim())}
          onNote={openNote}
          onMemorize={() => router.push(`/monologue/${monologue.id}/memorize`)}
          memorized={memorized}
          onToggleMemorized={handleToggleMemorized}
          saved={isFavorited}
          onToggleSaved={toggleFavorite}
          onEdit={
            user?.is_moderator ? () => setEditMonologueId(monologue.id) : undefined
          }
        />

        {/* The stage and the margin. 300px is the width of a margin you can
            actually read a sentence in; below lg it collapses and the rail's
            contents fall under the piece. */}
        <div className="mt-7 grid items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {mode === "read" && (
                  <ReadView
                    monologue={monologue}
                    size={textSize}
                    onSizeChange={setTextSize}
                    textSlot={
                      /* Signed out, or nothing to annotate: the plain reader.
                         The margin only appears for someone who has somewhere
                         to put a note, and a paywalled `text` is a teaser. */
                      annotatable ? (
                        <div ref={beatsWrapRef}>
                          <BeatReader
                            units={units}
                            beats={beatMap}
                            openIndex={openBeat}
                            onOpenChange={setOpenBeat}
                            onSave={(index, body, anchor) => {
                              saveBeat.mutate({
                                segmentIndex: index,
                                body,
                                anchorText: anchor,
                              });
                              /* The case for the margin was one number: two
                                 notes, ever, by two people. Shipping the fix
                                 without a way to read that number again would
                                 leave us guessing whether it worked. */
                              trackEvent(
                                body.trim() ? "beat_saved" : "beat_cleared",
                                {
                                  monologue_id: monologue.id,
                                  segment_index: index,
                                  length: body.trim().length,
                                  total_beats: beatMap.size,
                                },
                              );
                            }}
                          />
                        </div>
                      ) : undefined
                    }
                  />
                )}

                {/* Cut and Copy hold the same reading measure as Read, so the
                    piece doesn't jump width every time you change what you're
                    doing to it. */}
                {mode === "cut" && (
                  <div className="max-w-[62ch]">
                    <CutEditor
                      embedded
                      monologue={monologue}
                      onSaved={(start, end) =>
                        setMonologue((prev) =>
                          prev
                            ? {
                                ...prev,
                                cut_start_line: start ?? undefined,
                                cut_end_line: end ?? undefined,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                )}
                {mode === "copy" && <SidesSheet monologue={monologue} />}
              </motion.div>
            </AnimatePresence>

            {/* Saving is only the first half of a keepable piece. The moment it
                lands, offer the next step — cut, note, or run — instead of
                leaving the actor on a silent bookmark. */}
            <AnimatePresence>
              {justSaved && isFavorited && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="mt-9 border-l-2 px-5 py-4"
                    style={{
                      borderColor: "var(--t-orange-deep)",
                      background:
                        "color-mix(in oklab, var(--t-orange-deep) 7%, transparent)",
                    }}
                  >
                    <p className="t-m__display m-0 text-[22px] leading-[1.1]">
                      Saved to your collection.
                    </p>
                    <p
                      className="m-0 mt-1 text-sm"
                      style={{ color: "var(--t-muted-dark)" }}
                    >
                      Make it yours. Cut it to time, mark a beat, or run it.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openCut}
                        className="h-10 rounded-full border-[1.5px] px-4 text-[13px] font-bold"
                        style={{ borderColor: "var(--t-text)" }}
                      >
                        Cut it to time
                      </button>
                      <button
                        type="button"
                        onClick={openNote}
                        className="h-10 rounded-full border-[1.5px] px-4 text-[13px] font-bold"
                        style={{ borderColor: "var(--t-text)" }}
                      >
                        Mark a beat
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/monologue/${monologue.id}/work`)}
                        className="h-10 rounded-full px-4 text-[13px] font-bold"
                        style={{
                          background: "var(--t-cta-bg)",
                          color: "var(--t-cta-fg)",
                        }}
                      >
                        Rehearse it
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* The note that is about the piece rather than about a line. The
                margin holds the notes about its lines. */}
            <section
              ref={notesSectionRef}
              className="mt-14 border-t-[1.5px] border-dashed pt-6"
              style={{
                borderColor: "color-mix(in oklab, var(--t-text) 25%, transparent)",
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="t-m__display m-0 text-[26px] leading-[1.1]">
                  On the{" "}
                  <em className="italic" style={{ color: "var(--t-orange-deep)" }}>
                    whole piece.
                  </em>
                </h2>
                {/* Was silent. It saved on blur only, so a note typed and then
                    abandoned — closing the tab, hitting Rehearse — was simply
                    lost, with nothing on screen ever claiming otherwise. */}
                <span
                  aria-live="polite"
                  className="t-m__dir text-[11px] transition-opacity duration-300"
                  style={{
                    opacity: notesState === "idle" ? 0 : 1,
                    color:
                      notesState === "saved"
                        ? "var(--t-gel-ink)"
                        : "var(--t-faint)",
                  }}
                >
                  {notesState === "saving" ? "(saving.)" : notesState === "saved" ? "(saved.)" : ""}
                </span>
              </div>
              <textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={noteNotesFocused}
                onBlur={flushNotes}
                placeholder="Who you're talking to, what you want, why now…"
                rows={4}
                className="t-m__textarea mt-3.5 w-full resize-y rounded-2xl border-[1.5px] px-4 py-3.5 text-[15px] leading-[1.7]"
                style={{
                  borderColor: "var(--t-line-light)",
                  background: "var(--t-paper)",
                }}
              />
            </section>

            {/* Provenance. Where the text came from, said plainly, because the
                first question a working actor asks of a library is whether it
                made any of this up. */}
            <div
              className="mt-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 border-t pt-4 text-[13px]"
              style={{
                borderColor: "var(--t-line-light)",
                color: "var(--t-muted-dark-2)",
              }}
            >
              <p className="m-0 max-w-[56ch]">
                {monologue.word_count > 0 ? `${monologue.word_count} words · ` : ""}
                published text
                {monologue.translator ? `, ${monologue.translator} translation` : ""}.
                Nothing here is generated.
              </p>
              {monologue.source_url && (
                <a
                  href={monologue.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="t-m__dir inline-flex items-center gap-1 text-[12px] underline underline-offset-4"
                >
                  {monologue.source_type === "film" || monologue.source_type === "tv"
                    ? "view script"
                    : "view full play"}
                  <IconExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            <OthersFromPlay monologue={monologue} />
            <SameRegister monologue={monologue} />
          </article>

          {/* sticky, not fixed: a fixed child of an ancestor that gets a
              transform anchors to the ancestor instead of the viewport, and
              the platform header takes one when it hides on scroll. */}
          <div className="lg:sticky lg:top-[150px]">
            <MarginRail
              monologue={monologue}
              beatCount={beatMap.size}
              memorized={memorized}
              cutSeconds={cutSeconds}
              fullSeconds={fullSeconds}
              hasCut={Boolean(hasCut)}
              outOfReads={monologue.paywalled}
              onRehearse={() => router.push(`/monologue/${monologue.id}/work`)}
            />
          </div>
        </div>

        <EditMonologueModal
          monologueId={editMonologueId}
          onClose={() => setEditMonologueId(null)}
          onSave={async (body: EditMonologueBody) => {
            if (editMonologueId == null) return;
            setEditMonologueSaving(true);
            try {
              const res = await api.patch<{
                id: number;
                title: string;
                character_name: string;
                text: string;
                stage_directions: string | null;
                play_title: string;
                play_id: number;
                author: string;
                category: string;
                character_gender: string | null;
                character_age_range: string | null;
                primary_emotion: string | null;
                themes: string[] | null;
                scene_description: string | null;
                word_count: number;
                estimated_duration_seconds: number;
              }>(`/api/admin/monologues/${editMonologueId}`, body);
              toast.success("Monologue updated");
              setEditMonologueId(null);
              if (params.id && String(editMonologueId) === String(params.id) && monologue) {
                setMonologue((prev) =>
                  prev && res.data && prev.id === res.data.id
                    ? {
                        ...prev,
                        title: res.data.title,
                        character_name: res.data.character_name,
                        text: res.data.text,
                        stage_directions: res.data.stage_directions ?? undefined,
                        play_title: res.data.play_title,
                        play_id: res.data.play_id,
                        author: res.data.author,
                        category: res.data.category,
                        character_gender: res.data.character_gender ?? undefined,
                        character_age_range: res.data.character_age_range ?? undefined,
                        primary_emotion: res.data.primary_emotion ?? undefined,
                        themes: res.data.themes ?? undefined,
                        scene_description: res.data.scene_description ?? undefined,
                        word_count: res.data.word_count,
                        estimated_duration_seconds: res.data.estimated_duration_seconds,
                      }
                    : prev,
                );
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Update failed");
            } finally {
              setEditMonologueSaving(false);
            }
          }}
          isSaving={editMonologueSaving}
        />
      </main>

      {!monologue.paywalled && (
        <RunBar onRehearse={() => router.push(`/monologue/${monologue.id}/work`)} />
      )}
    </div>
  );
}
