"use client";

import { useState, useEffect } from "react";
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
      } else {
        await api.post(`/api/monologues/${monologue.id}/favorite`);
        setIsFavorited(true);
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
                  {/* One primary action — Rehearse -> the /work stage. Memorize and
                      Self-tape are quieter secondary paths, not competing buttons. */}
                  <Button
                    onClick={() => router.push(`/monologue/${monologue.id}/work`)}
                    className="flex-shrink-0"
                  >
                    Rehearse
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => router.push(`/monologue/${monologue.id}/memorize`)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    Memorize
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => router.push(`/audition?monologue=${monologue.id}`)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    Self-tape
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
                  {/* Owning the piece is the point of this surface, so the
                      collection control is a labeled button, not a bare icon. */}
                  <Button
                    variant={isFavorited ? "default" : "outline"}
                    onClick={toggleFavorite}
                    aria-label={isFavorited ? "In your collection" : "Add to collection"}
                    className={`flex-shrink-0 gap-2 ${isFavorited ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:text-accent"}`}
                  >
                    <IconBookmark className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
                    {isFavorited ? "In collection" : "Add to collection"}
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardContent className="space-y-3 pt-6">
            <div>
              <h2 className="text-base font-semibold">Your notes</h2>
              <p className="text-sm text-muted-foreground">
                Beats, intentions, reminders. Saved to your collection.
              </p>
            </div>
            <textarea
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

        <Card className="rounded-lg">
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
