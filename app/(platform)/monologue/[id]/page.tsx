"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconBookmark,
  IconArrowLeft,
  IconEdit,
  IconBulb,
  IconBulbFilled,
} from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  MonologueHeader,
  MonologueBody,
  MonologueFooter,
} from "@/components/monologue/MonologueDetailContent";
import { GhostLightSketch } from "@/components/brand/sketches";
import { CutEditor } from "@/components/monologue/CutEditor";
import { ExportSheet } from "@/components/monologue/ExportSheet";
import { useSaveNotes } from "@/hooks/useCollectionMeta";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useAuth } from "@/lib/auth";
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
  // Saving used to be a silent bookmark: 889 opens produced 45 saves, and the
  // things that turn a save into a working piece (a cut, a note) sat two scrolls
  // down where ~nobody found them. On save we now surface the next step inline,
  // right where the intent is. (Savers return 2.1x more than non-savers.)
  const [justSaved, setJustSaved] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
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

  const scrollToNotes = () => {
    notesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    notesRef.current?.focus();
  };

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
    <div className="container mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back
        </button>

        <MonologueHeader monologue={monologue} />

        {/* The working bar. It follows you down the piece so the one thing you
            came to do — run it — is never scrolled away, and so switching how
            you're looking at the text doesn't mean scrolling back up.
            top-16/sm:top-20 clears the platform nav (65px / 81px). */}
        <div ref={anchorRef} aria-hidden className="mt-8" />
        <div className="sticky top-16 z-30 -mx-4 border-y border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-md sm:top-20">
          <div className="flex items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="How to view this piece"
              className="flex items-center gap-0.5"
            >
              {MODES.map((m) => (
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
              {/* Off-book status. Distinct from the "Memorize" drill below —
                  this one only records where you are, it doesn't go anywhere. */}
              <button
                type="button"
                onClick={handleToggleMemorized}
                aria-pressed={memorized}
                aria-label={memorized ? "Off book — tap to unmark" : "Mark as off book"}
                title={memorized ? "Off book — tap to unmark" : "Mark as off book"}
                className="rounded-full p-2 transition-colors hover:bg-muted"
              >
                {memorized ? (
                  <IconBulbFilled className="h-5 w-5 text-amber-400 drop-shadow-[0_0_7px_rgba(251,191,36,0.6)]" />
                ) : (
                  <IconBulb className="h-5 w-5 text-muted-foreground/50 hover:text-muted-foreground" />
                )}
              </button>

              {/* The retention lever. Savers return 2.1x more, so the collection
                  control keeps its place right beside the primary action. */}
              <button
                type="button"
                onClick={toggleFavorite}
                aria-pressed={isFavorited}
                aria-label={isFavorited ? "In your collection" : "Add to collection"}
                title={isFavorited ? "In your collection" : "Add to collection"}
                className={`rounded-full p-2 transition-colors hover:bg-muted ${
                  isFavorited ? "text-accent" : "text-muted-foreground"
                }`}
              >
                <IconBookmark className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
              </button>

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
              <Button
                size="sm"
                onClick={() => router.push(`/monologue/${monologue.id}/work`)}
                className="ml-1 flex-shrink-0"
              >
                Rehearse
              </Button>
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
              {mode === "read" && <MonologueBody monologue={monologue} measured />}

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
                  <Button size="sm" variant="outline" onClick={scrollToNotes}>
                    Add a note
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
            above it, so it reads as margin notes rather than another feature. */}
        <section className="mt-12 border-t border-border/60 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your notes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Beats, intentions, reminders. Saved to your collection.
          </p>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((notes ?? "") !== (monologue.notes ?? "")) {
                saveNotes.mutate({ monologueId: monologue.id, notes });
                setMonologue((prev) => (prev ? { ...prev, notes } : prev));
              }
            }}
            placeholder="Add a note…"
            rows={4}
            className="mt-3 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          />
        </section>

        {/* The other way to work it, kept as a quiet path rather than a button
            competing with Rehearse. */}
        <section className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6">
          <div>
            <p className="text-sm font-medium text-foreground">Get it off book</p>
            <p className="text-sm text-muted-foreground">
              Line-by-line drill until you don&apos;t need the page.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/monologue/${monologue.id}/memorize`)}
          >
            Memorize
          </Button>
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
  );
}
