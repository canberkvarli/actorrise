"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  EditMonologueModal,
  type EditMonologueBody,
} from "@/components/admin/EditMonologueModal";
import {
  IconLoader2,
  IconCheck,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

interface ReviewItem {
  id: number;
  title: string;
  character_name: string;
  play_title: string;
  play_id: number;
  author: string;
  source_type: string;
  text: string;
  proposed_text: string | null;
  review_reasons: string[];
  word_count: number;
}

// Human-readable labels for the deterministic quality-gate reason codes.
const REASON_LABELS: Record<string, string> = {
  interleaved_speaker: "multiple speakers",
  caps_residue: "ALL-CAPS name residue",
  scene_heading: "scene heading",
  parenthetical_direction: "stage direction",
  bracket_cue: "bracket cue",
  truncated_end: "cut off mid-sentence",
  too_short: "too short",
  too_long: "too long",
  html_residue: "HTML residue",
  weird_chars: "broken characters",
  empty: "no usable text",
  repair_error: "AI could not process",
};

export default function MonologueReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<ReviewItem[]>("/api/admin/monologues/review?limit=300")
      .then((res) => setItems(res.data ?? []))
      .catch((err) => setError(err?.message ?? "Failed to load review queue"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeItem = (id: number) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  const approve = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/api/admin/monologues/${id}/review/approve`);
      removeItem(id);
      toast.success("Approved AI fix");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/api/admin/monologues/${id}/review/dismiss`);
      removeItem(id);
      toast.success("Dismissed (kept original text)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dismiss failed");
    } finally {
      setBusyId(null);
    }
  };

  const del = async (id: number) => {
    if (!window.confirm("Delete this monologue permanently? This cannot be undone.")) {
      return;
    }
    setBusyId(id);
    try {
      await api.delete(`/api/admin/monologues/${id}`);
      removeItem(id);
      toast.success("Monologue deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const onEditSave = async (body: EditMonologueBody) => {
    if (editId == null) return;
    setSavingEdit(true);
    try {
      await api.patch(`/api/admin/monologues/${editId}`, body);
      // A manual text edit clears the review flag server-side.
      removeItem(editId);
      toast.success("Monologue updated");
      setEditId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Monologue review</h2>
          <p className="text-sm text-muted-foreground">
            Broken monologues the auto-repair couldn&apos;t safely clean. Approve the
            AI fix, edit by hand, dismiss (keep original), or delete.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground tabular-nums">
            {items.length} pending
          </span>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-destructive py-4">{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="border border-border/60 bg-card/30 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing to review. The library is clean.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((it) => {
          const hasProposal = !!(it.proposed_text && it.proposed_text.trim());
          const busy = busyId === it.id;
          return (
            <div
              key={it.id}
              className="border border-border/60 bg-card/40 p-4 sm:p-5 space-y-4"
            >
              {/* header */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {it.character_name}
                  </span>
                  <span className="text-muted-foreground"> — {it.play_title}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  #{it.id} · {it.author || "Unknown"} · {it.source_type} ·{" "}
                  {it.word_count} words
                </div>
              </div>

              {/* reasons — sharp, non-interactive */}
              <div className="flex flex-wrap gap-1.5">
                {it.review_reasons.map((r) => (
                  <span
                    key={r}
                    className="border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {REASON_LABELS[r] ?? r}
                  </span>
                ))}
              </div>

              {/* current vs proposed */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Current (flagged)
                  </p>
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap border border-border/50 bg-background/60 p-3 text-sm leading-relaxed">
                    {it.text}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Proposed fix
                  </p>
                  {hasProposal ? (
                    <div className="max-h-64 overflow-y-auto whitespace-pre-wrap border p-3 text-sm leading-relaxed border-[#CB4B00]/30 bg-[#CB4B00]/5">
                      {it.proposed_text}
                    </div>
                  ) : (
                    <div className="border border-dashed border-border/60 bg-background/30 p-3 text-sm text-muted-foreground">
                      No AI proposal — the text needs a hand-edit or deletion.
                    </div>
                  )}
                </div>
              </div>

              {/* actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => approve(it.id)}
                  disabled={!hasProposal || busy}
                  className="gap-1.5 bg-[#CB4B00] hover:bg-[#B03000] text-white"
                >
                  {busy ? (
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <IconCheck className="h-4 w-4" />
                  )}
                  Approve fix
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditId(it.id)}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <IconPencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismiss(it.id)}
                  disabled={busy}
                  className="gap-1.5 text-muted-foreground"
                >
                  <IconX className="h-4 w-4" />
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => del(it.id)}
                  disabled={busy}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  <IconTrash className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {editId != null && (
        <EditMonologueModal
          monologueId={editId}
          onClose={() => setEditId(null)}
          onSave={onEditSave}
          isSaving={savingEdit}
        />
      )}
    </div>
  );
}
