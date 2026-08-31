"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconTrash, IconX, IconRefresh } from "@tabler/icons-react";

import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * The monologue review queue.
 *
 * The backend has always exposed /api/admin/monologues/review (and a /count
 * endpoint whose docstring literally says "for the admin nav badge"), but the
 * page was retired when the queue sat empty. It is populated again — the
 * interleaved-dialogue and flattened-scene passes route anything they cannot fix
 * safely here rather than guessing at it — so the queue needs a front door.
 *
 * Most items carry NO proposed_text: a flattened scene cannot be repaired by
 * deletion, so those were queued deliberately. Approve is therefore only offered
 * when a proposal actually exists; otherwise the real actions are edit, dismiss,
 * or delete.
 */

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
  /** Nullable in Postgres; the type claimed otherwise. */
  review_reasons: string[] | null;
  word_count: number;
}

// What each flag actually means, in one line. The reasons are machine slugs and
// nobody should have to remember which pass produced which.
const REASON_HELP: Record<string, string> = {
  flattened_scene:
    "A whole dialogue scene collapsed into one speech. Often runs out of order.",
  interleaved_dialogue: "Another character's line is welded into this one.",
  stage_direction_residue: "An Enter/Exit direction is inside the speech.",
  ai_unsalvageable: "The repair pass could not produce anything usable.",
  ai_not_verbatim: "The repair added words instead of only deleting them.",
  ai_over_dropped: "The repair cut more than half the speech.",
  ai_too_short: "The repaired text fell under the length floor.",
  quality: "Flagged by the quality gate.",
};

function ReasonTag({ reason }: { reason: string }) {
  // Sharp corners: a tag is not a button.
  return (
    <span
      title={REASON_HELP[reason] ?? reason}
      className="border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
    >
      {reason.replace(/_/g, " ")}
    </span>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(item.text);
  const [showProposal, setShowProposal] = useState(false);

  const done = () => {
    qc.invalidateQueries({ queryKey: ["admin-review-queue"] });
    qc.invalidateQueries({ queryKey: ["admin-review-badge"] });
  };

  const save = useMutation({
    mutationFn: () => api.patch(`/api/admin/monologues/${item.id}`, { text: draft }),
    onSuccess: done,
  });
  const approve = useMutation({
    mutationFn: () => api.post(`/api/admin/monologues/${item.id}/review/approve`),
    onSuccess: done,
  });
  const dismiss = useMutation({
    mutationFn: () => api.post(`/api/admin/monologues/${item.id}/review/dismiss`),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/admin/monologues/${item.id}`),
    onSuccess: done,
  });

  const busy =
    save.isPending || approve.isPending || dismiss.isPending || remove.isPending;
  const edited = draft !== item.text;
  const hasProposal = !!item.proposed_text?.trim();

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-typewriter text-base text-foreground">
            {item.character_name}
          </h2>
          <span className="text-xs text-muted-foreground">
            #{item.id} · {item.play_title} · {item.author} · {item.source_type} ·{" "}
            {item.word_count} words
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {(item.review_reasons ?? []).map((r) => (
            <ReasonTag key={r} reason={r} />
          ))}
        </div>

        {hasProposal && (
          <button
            onClick={() => setShowProposal((v) => !v)}
            className="mt-3 text-xs text-primary underline underline-offset-2"
          >
            {showProposal ? "Hide" : "Show"} the repair pass&rsquo;s proposal
          </button>
        )}
        {hasProposal && showProposal && (
          <p className="font-typewriter mt-2 whitespace-pre-wrap border-l-2 border-primary/40 bg-muted/40 p-3 text-sm text-muted-foreground">
            {item.proposed_text}
          </p>
        )}

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(18, Math.max(6, draft.split("\n").length + 2))}
          spellCheck={false}
          className="font-typewriter mt-3 w-full resize-y border border-border bg-background p-3 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!edited || busy} onClick={() => save.mutate()}>
            <IconCheck className="mr-1 h-4 w-4" />
            Save edit
          </Button>
          {hasProposal && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => approve.mutate()}
            >
              Use proposal
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => dismiss.mutate()}
            title="The flag is wrong and the text is fine as it stands"
          >
            <IconX className="mr-1 h-4 w-4" />
            Not a problem
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              // No confirm dialog: a browser modal blocks the page, and the
              // queue is the only place this button exists.
              if (window.confirm(`Delete "${item.character_name}" (#${item.id})?`)) {
                remove.mutate();
              }
            }}
            className="text-destructive hover:text-destructive"
          >
            <IconTrash className="mr-1 h-4 w-4" />
            Delete
          </Button>
          {edited && (
            <span className="text-xs text-muted-foreground">unsaved changes</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminMonologueReviewPage() {
  const [reason, setReason] = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-review-queue"],
    queryFn: async () => {
      const res = await api.get<ReviewItem[]>(
        "/api/admin/monologues/review?limit=500"
      );
      return res.data;
    },
    staleTime: 15_000,
  });

  // Array.isArray, not `?? []`: `??` only catches null/undefined, so any other
  // shape reaches the for-of below and throws in render, taking the whole queue
  // out through the error boundary.
  const items = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const reasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      // review_reasons is a nullable Postgres array. Every pending row happens
      // to have one today, so this is defensive rather than a live fault — but
      // one NULL would blank the review queue entirely.
      for (const r of it.review_reasons ?? []) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const shown = reason
    ? items.filter((i) => (i.review_reasons ?? []).includes(reason))
    : items;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <p className="stage-direction mb-2 text-xs text-muted-foreground/70">
          (things the repair passes would not guess at.)
        </p>
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-muted-foreground">
          {isLoading ? "Loading…" : `${items.length} flagged`}
        </p>
      </div>

      {reasons.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={reason === "" ? "default" : "outline"}
            onClick={() => setReason("")}
          >
            All ({items.length})
          </Button>
          {reasons.map(([r, n]) => (
            <Button
              key={r}
              size="sm"
              variant={reason === r ? "default" : "outline"}
              onClick={() => setReason(r)}
            >
              {r.replace(/_/g, " ")} ({n})
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <IconRefresh className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-muted-foreground">
          Nothing flagged. The queue fills when an ingest or repair pass hits
          something it cannot fix safely.
        </p>
      )}

      <div className="space-y-4">
        {shown.map((item) => (
          <ReviewCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
