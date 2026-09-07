"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconBookmark,
  IconArrowLeft,
  IconPlayerPlay,
  IconEdit,
  IconBulb,
  IconBulbFilled,
  IconNote,
  IconRepeat,
} from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import api from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { motion, AnimatePresence } from "framer-motion";
import {
  MonologueHeader,
  MonologueOneSheet,
  MonologueBody,
  MonologueFooter,
} from "@/components/monologue/MonologueDetailContent";
import { GhostLightSketch } from "@/components/brand/sketches";
import { CutEditor } from "@/components/monologue/CutEditor";
import { MonologueWall } from "@/components/monologue/MonologueWall";
import { ExportSheet } from "@/components/monologue/ExportSheet";
import { useSaveNotes } from "@/hooks/useCollectionMeta";
import { useBeats, useSaveBeat } from "@/hooks/useBeats";
import { BeatReader, BEAT_LINE_ATTR } from "@/components/monologue/BeatReader";
import { beatUnits } from "@/lib/beatUnits";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useAuth } from "@/lib/auth";
import { InstantTooltip } from "@/components/ui/instant-tooltip";
import { EditMonologueModal } from "@/components/admin/EditMonologueModal";
import type { EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { toast } from "sonner";

/**
 * One piece, three ways of looking at it.
 *
 * This page used to stack four cards, and three of them rendered the whole
 * monologue again: once to read, once inside the cut editor, once inside the
 * export preview. On anything longer than a minute you scrolled past the same
 * speech three times to reach the bottom.
 *
 * Reading it, cutting it, and printing it aren't separate features — they're
 * three views of the same text. So the text renders once, on one surface, and
 * the mode switch above it changes what you can do to it.
 */

type Mode = "read" | "cut" | "copy";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "read", label: "Read", hint: "The piece as written" },
  { id: "cut", label: "Cut", hint: "Trim it to an audition length" },
  { id: "copy", label: "Copy", hint: "Print or copy your sides" },
];

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

  return (
    /* Bottom padding clears the floating Rehearse pill. Without it the pill
       parked on top of the notes panel, which is the last thing on the page. */
    <div className="pb-40 lg:pb-28">
      {/* The one-sheet runs full-bleed, so it sits outside the reading
          container rather than inside it. Back rides on the banner — a bordered
          button above the header would be the first thing you see, over the
          piece it belongs to — but it is a row inside the header, not a float
          over it. Floating meant it landed on the poster's top-left corner.

          Plays take the one-sheet too. They have no poster, so the cover is
          printed from the row — see PlayCover. Giving a play the plain
          typographic header instead made every film feel like the real page
          and every play like the fallback, which is backwards for a
          monologue library built on plays. */}
      <MonologueOneSheet
        monologue={monologue}
        backSlot={
          <button
            type="button"
            onClick={() => router.back()}
            className="-ml-1 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm text-white/70 drop-shadow transition-colors hover:text-white"
          >
            <IconArrowLeft className="h-4 w-4" />
            Back
          </button>
        }
      />

      <div className="container mx-auto max-w-3xl px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >

        {/* The working bar. It follows you down the piece so the one thing you
            came to do — run it — is never scrolled away, and so switching how
            you're looking at the text doesn't mean scrolling back up.
            top-16/sm:top-20 clears the platform nav (65px / 81px). */}
        <div ref={anchorRef} aria-hidden className="mt-6" />
        <div className="sticky top-16 z-30 -mx-4 border-y border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-md sm:top-20">
          <div className="flex items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="How to view this piece"
              className="flex items-center gap-0.5"
            >
              {/* Cut and Copy work on `text`, which is a teaser once the free
                  reads are spent. Offering them would hand the actor a
                  forty-word "piece" to trim and export as if it were real. */}
              {(monologue.paywalled ? MODES.filter((m) => m.id === "read") : MODES).map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={mode === m.id}
                  title={m.hint}
                  onClick={() => selectMode(m.id)}
                  className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${
                    mode === m.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === m.id && (
                    <motion.span
                      layoutId="monologue-mode-pill"
                      className="absolute inset-0 rounded-md bg-muted"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{m.label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              {/* Opens a note on the line you are looking at — see openNote.
                  This used to jump to the box at the foot of the page, which
                  is the trip the margin was built to remove. */}
              <InstantTooltip
                label={
                  beatMap.size > 0
                    ? `Your notes · ${beatMap.size}`
                    : "Note this line"
                }
              >
                <button
                  type="button"
                  onClick={openNote}
                  aria-label="Note this line"
                  className={`rounded-full p-2 transition-colors hover:bg-muted ${
                    beatMap.size > 0 || notes.trim()
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <IconNote className="h-5 w-5" />
                </button>
              </InstantTooltip>

              {/* Memorize, moved off the Rehearse pill. A drill is a way of
                  working the text, which is what this row is. */}
              {!monologue.paywalled && (
                <InstantTooltip label="Memorize · line by line">
                  <button
                    type="button"
                    onClick={() => router.push(`/monologue/${monologue.id}/memorize`)}
                    aria-label="Memorize line by line"
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <IconRepeat className="h-5 w-5" />
                  </button>
                </InstantTooltip>
              )}

              {/* Off-book status. Distinct from the "Memorize" drill below —
                  this one only records where you are, it doesn't go anywhere. */}
              <InstantTooltip label={memorized ? "Off book — tap to unmark" : "Mark as off book"}>
              <button
                type="button"
                onClick={handleToggleMemorized}
                aria-pressed={memorized}
                aria-label={memorized ? "Off book — tap to unmark" : "Mark as off book"}
                className="rounded-full p-2 transition-colors hover:bg-muted"
              >
                {memorized ? (
                  <IconBulbFilled className="h-5 w-5 text-amber-400 drop-shadow-[0_0_7px_rgba(251,191,36,0.6)]" />
                ) : (
                  <IconBulb className="h-5 w-5 text-muted-foreground/50 hover:text-muted-foreground" />
                )}
              </button>
              </InstantTooltip>

              {/* The retention lever. Savers return 2.1x more, so the collection
                  control keeps its place right beside the primary action. */}
              {/* Last icon in the bar, so its label hangs off the right edge of
                  the reading column — and on a phone that edge is the screen.
                  Right-aligned, it can only grow inwards. */}
              <InstantTooltip
                align="end"
                label={isFavorited ? "In your collection" : "Save to collection"}
              >
              <button
                type="button"
                onClick={toggleFavorite}
                aria-pressed={isFavorited}
                aria-label={isFavorited ? "In your collection" : "Add to collection"}
                /* Was text-accent, which is a *surface* token — the pale blue a
                   panel is painted with in light, and a near-black warm grey in
                   dark. So a saved bookmark was invisible in both themes for the
                   same reason: it was drawing an icon in a background colour.
                   Teal is what Collection already means everywhere else (the
                   collection toggle on /monologues, the "your lane" mark), and
                   it leaves orange to the one primary action. */
                className={`rounded-full p-2 transition-colors hover:bg-muted ${
                  isFavorited
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-muted-foreground"
                }`}
              >
                <IconBookmark className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
              </button>
              </InstantTooltip>

              {user?.is_moderator && (
                <button
                  type="button"
                  onClick={() => setEditMonologueId(monologue.id)}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Edit monologue"
                  title="Edit monologue"
                >
                  <IconEdit className="h-5 w-5" />
                </button>
              )}

              {/* One primary action — Rehearse -> the /work stage. Self-tape entry
                  point pulled 2026-08-27: 0 uses across 649 users, and it
                  cluttered the core flow we lose people in. The /audition
                  recorder + tapes API stay intact, just unlinked. */}
              {/* Rehearse has left this strip — see the floating pill at the
                  foot of the page. The bar was carrying three different kinds
                  of thing at once: ways to *view* the piece (tabs), things that
                  are *true* of it (off book, saved), and the one thing to *do*
                  with it. Three grammars in one row, and on a phone the action
                  was the part that got pushed off the right edge. */}
            </div>
          </div>
        </div>

        {/* The stage: one text, whichever way you're currently working it. */}
        <div className="pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {mode === "read" && (
                <>
                  {/* Signed out, or nothing to annotate: the plain reader. The
                      margin only appears for someone who has somewhere to put
                      a note, and a paywalled `text` is a forty-word teaser. */}
                  <MonologueBody
                    monologue={monologue}
                    measured
                    textSlot={
                      user && !monologue.paywalled && units.length > 0 ? (
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
                  {monologue.paywalled && <MonologueWall />}
                </>
              )}

              {/* Cut and Copy hold the same reading measure as Read, so the piece
                  doesn't jump width every time you change what you're doing to it. */}
              {mode === "cut" && (
                <div className="mx-auto max-w-[62ch]">
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
              {mode === "copy" && (
                <div className="mx-auto max-w-[62ch]">
                  <ExportSheet embedded monologue={monologue} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Saving is only the first half of a keepable piece. The moment it
            lands, offer the next step — cut, note, or run — instead of leaving
            the actor on a silent bookmark with nothing to come back for. */}
        <AnimatePresence>
          {justSaved && isFavorited && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-10 border-l-2 border-accent/50 bg-accent/5 p-4">
                <p className="text-sm font-semibold">Saved to your collection.</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Make it yours — cut it to time, note your beats, or run it.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={openCut}>
                    Cut it to time
                  </Button>
                  <Button size="sm" variant="outline" onClick={openNote}>
                    Mark a beat
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/monologue/${monologue.id}/work`)}
                  >
                    Rehearse it
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Your marks on the piece. Not a card — it belongs to the monologue
            above it, so it reads as margin notes rather than another feature.

            Reachable from the working bar as well, which is where it is
            actually wanted: this sits below the whole piece, so noting a beat
            meant scrolling past every line to find it and scrolling back. */}
        <section ref={notesSectionRef} className="mt-12 border-t border-border/60 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            {/* Retitled once the margin existed. "Your notes" was true of both
                and told you nothing about which one you were looking at; this
                is the note about the piece, the margin holds the notes about
                its lines. */}
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              On the whole piece
            </h2>
            {/* Was silent. It saved on blur only, so a note typed and then
                abandoned — closing the tab, hitting Rehearse — was simply
                lost, with nothing on screen ever having claimed otherwise. */}
            <span
              aria-live="polite"
              className={`font-typewriter text-[11px] tracking-wide transition-opacity duration-300 ${
                notesState === "idle" ? "opacity-0" : "opacity-70"
              } ${notesState === "saved" ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground"}`}
            >
              {notesState === "saving" ? "saving…" : notesState === "saved" ? "saved" : ""}
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
            className="mt-3 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          />
        </section>

        <div className="mt-10">
          <MonologueFooter
            monologue={monologue}
            onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
          />
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
      </motion.div>
      </div>

      {/* The one thing you came here to do, always in reach.
          It sits above the platform's bottom nav rather than becoming a second
          bar beside it — 88px on a phone clears the 65px tab strip, 24px on
          desktop where there is no strip. Its own token pair: --primary stays
          bright so orange *text* carries on a dark page, while a filled button
          keeps the brand orange and a white label, because a large block does
          not need the lift and a black word stamped in an orange pill is what
          the brightened fill forces. */}
      {!monologue.paywalled && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed inset-x-0 bottom-[88px] z-40 flex justify-center px-4 lg:bottom-6"
        >
          {/* One action, not two. Pairing Rehearse with Off book put a second
              button of near-equal weight against the one thing this page is
              for, and the two are not siblings anyway: one runs the piece out
              loud, the other is a drill. Memorize lives in the working bar
              with the other ways of handling the text. */}
          <button
            type="button"
            onClick={() => router.push(`/monologue/${monologue.id}/work`)}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-primary-solid px-6 py-3 text-sm font-semibold text-primary-solid-foreground shadow-lg shadow-black/20 transition-transform hover:scale-[1.03] active:scale-95"
          >
            <IconPlayerPlay className="h-4 w-4" />
            Rehearse
          </button>
        </motion.div>
      )}
    </div>
  );
}
