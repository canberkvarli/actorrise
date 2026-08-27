"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconBookmark, IconArrowLeft, IconEdit, IconBulb, IconBulbFilled } from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import api from "@/lib/api";
import { motion } from "framer-motion";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { CutEditor } from "@/components/monologue/CutEditor";
import { ExportSheet } from "@/components/monologue/ExportSheet";
import { useSaveNotes } from "@/hooks/useCollectionMeta";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useAuth } from "@/lib/auth";
import { EditMonologueModal } from "@/components/admin/EditMonologueModal";
import type { EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { toast } from "sonner";

export default function MonologueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [notes, setNotes] = useState("");
  const [memorized, setMemorized] = useState(false);
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
  const cutRef = useRef<HTMLDivElement>(null);

  const scrollToNotes = () => {
    notesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    notesRef.current?.focus();
  };
  const scrollToCut = () => {
    cutRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    if (params.id) {
      fetchMonologue(params.id as string);
    }
  }, [params.id]);

  const fetchMonologue = async (id: string) => {
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
      console.error("Error fetching monologue:", error);
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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-8 w-32 mb-8" />
        <Card className="rounded-lg">
          <CardContent className="pt-6 space-y-6">
            <Skeleton className="h-10 w-3/4 rounded-lg" />
            <Skeleton className="h-6 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!monologue) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="rounded-lg">
          <CardContent className="pt-12 pb-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Monologue not found</h3>
            <Button onClick={() => router.push("/monologues")} className="mt-4">
              Back to Monologues
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4 hover:text-primary"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <Card className="rounded-lg">
          <CardContent className="pt-8">
            <MonologueDetailContent
              monologue={monologue}
              onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
              headerActions={
                <div className="flex items-center gap-2">
                  {/* One primary action — Rehearse -> the /work stage. Memorize is
                      the one quieter secondary path, not a competing button.
                      Self-tape entry point pulled 2026-08-27: 0 uses across 649
                      users, and it cluttered the core flow we lose people in. The
                      /audition recorder + tapes API stay intact, just unlinked —
                      re-add this button to bring it back. */}
                  <Button
                    onClick={() => router.push(`/monologue/${monologue.id}/work`)}
                    className="flex-shrink-0"
                  >
                    Rehearse
                  </Button>
                  {/* The retention lever. Savers return 2.1x more, so the
                      collection control sits second — right after Rehearse —
                      not buried behind the quieter secondary paths. */}
                  <Button
                    variant={isFavorited ? "default" : "outline"}
                    onClick={toggleFavorite}
                    aria-label={isFavorited ? "In your collection" : "Add to collection"}
                    className={`flex-shrink-0 gap-2 ${isFavorited ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:text-accent"}`}
                  >
                    <IconBookmark className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
                    {isFavorited ? "In collection" : "Add to collection"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => router.push(`/monologue/${monologue.id}/memorize`)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    Memorize
                  </Button>
                  {user?.is_moderator && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setEditMonologueId(monologue.id)}
                      className="flex-shrink-0"
                      aria-label="Edit monologue"
                    >
                      <IconEdit className="h-5 w-5" />
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={handleToggleMemorized}
                    aria-pressed={memorized}
                    aria-label={memorized ? "Memorized — tap to unmark" : "Mark as memorized"}
                    title={memorized ? "Memorized — tap to unmark" : "Mark as memorized"}
                    className="flex-shrink-0 rounded-full p-1.5"
                  >
                    {memorized ? (
                      <IconBulbFilled className="h-5 w-5 text-amber-400 drop-shadow-[0_0_7px_rgba(251,191,36,0.6)]" />
                    ) : (
                      <IconBulb className="h-5 w-5 text-muted-foreground/50 hover:text-muted-foreground" />
                    )}
                  </button>
                </div>
              }
            />
          </CardContent>
        </Card>

        {/* Saving is only the first half of a keepable piece. The moment it
            lands, offer the next step — cut, note, or run — instead of leaving
            the actor on a silent bookmark with nothing to come back for. */}
        {justSaved && isFavorited && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="rounded-lg border-accent/40 bg-accent/5">
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Saved to your collection.</p>
                  <p className="text-sm text-muted-foreground">
                    Make it yours — cut it to time, note your beats, or run it.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={scrollToCut}>
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
              </CardContent>
            </Card>
          </motion.div>
        )}

        <Card className="rounded-lg">
          <CardContent className="space-y-3 pt-6">
            <div>
              <h2 className="text-base font-semibold">Your notes</h2>
              <p className="text-sm text-muted-foreground">
                Beats, intentions, reminders. Saved to your collection.
              </p>
            </div>
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
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            />
          </CardContent>
        </Card>

        <Card ref={cutRef} className="rounded-lg">
          <CardContent className="pt-6">
            <CutEditor
              monologue={monologue}
              onSaved={(start, end) =>
                setMonologue((prev) =>
                  prev ? { ...prev, cut_start_line: start ?? undefined, cut_end_line: end ?? undefined } : prev,
                )
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardContent className="pt-6">
            <ExportSheet monologue={monologue} />
          </CardContent>
        </Card>

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
                    : prev
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
