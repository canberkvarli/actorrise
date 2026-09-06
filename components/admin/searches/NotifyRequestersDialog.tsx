"use client";

/**
 * The drafts that go to the actors who asked for a title, once it lands.
 *
 * Canberk asked for "one button and send". The button gets him a finished
 * draft; it does not skip him. At one to three people per title a real note
 * beats a template, and the send rule is draft, approve, send.
 *
 * Nothing here sends on mount or on open. The only send is the explicit press,
 * and only the rows still ticked.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BRAND, type NotifyDraft } from "./shared";

interface Props {
  requestId: number;
  title: string;
  onClose: () => void;
  onSent: (count: number) => void;
}

export function NotifyRequestersDialog({ requestId, title, onClose, onSent }: Props) {
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [edited, setEdited] = useState<Record<number, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["notify-draft", requestId],
    queryFn: async () => {
      const res = await api.get<{
        title: string;
        piece_count: number;
        url: string;
        drafts: NotifyDraft[];
        skipped: { user_id: number; reason: string }[];
      }>(`/api/admin/content-requests/${requestId}/notify-draft`);
      return res.data;
    },
  });

  const drafts = useMemo(() => data?.drafts ?? [], [data]);
  const selected = drafts.filter((d) => !excluded.has(d.requester_id));

  const sendMutation = useMutation({
    mutationFn: async () => {
      // One send per person: these are individual notes, not a campaign.
      for (const d of selected) {
        await api.post("/api/admin/emails/send", {
          to: d.email,
          subject: d.subject,
          body: edited[d.requester_id] ?? d.body,
        });
      }
      await api.post(`/api/admin/content-requests/${requestId}/mark-notified`, {
        requester_ids: selected.map((d) => d.requester_id),
      });
      return selected.length;
    },
    onSuccess: (n) => onSent(n),
  });

  const toggle = (id: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-lg border bg-background p-5 shadow-lg">
        <div className="mb-4">
          <h2 className="text-base font-medium">Tell them {title} is up</h2>
          {data ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {data.piece_count} {data.piece_count === 1 ? "piece" : "pieces"} in the
              library. {drafts.length} {drafts.length === 1 ? "person" : "people"} asked
              and {drafts.length === 1 ? "has" : "have"} not been told.
              {data.skipped.length > 0
                ? ` ${data.skipped.length} skipped, on the do-not-contact list.`
                : ""}
            </p>
          ) : null}
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Building drafts…</p> : null}
        {error ? (
          <p className="text-sm text-red-600">
            {(error as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail ?? "Could not build the drafts."}
          </p>
        ) : null}

        <div className="space-y-3">
          {drafts.map((d) => {
            const off = excluded.has(d.requester_id);
            return (
              <div
                key={d.requester_id}
                className={`rounded border p-3 ${off ? "opacity-40" : ""}`}
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={!off}
                    onChange={() => toggle(d.requester_id)}
                  />
                  {d.name} <span className="font-normal text-muted-foreground">{d.email}</span>
                </label>
                <p className="mt-2 text-xs text-muted-foreground">{d.subject}</p>
                <textarea
                  value={edited[d.requester_id] ?? d.body}
                  onChange={(e) =>
                    setEdited((prev) => ({ ...prev, [d.requester_id]: e.target.value }))
                  }
                  disabled={off}
                  rows={10}
                  className="mt-2 w-full rounded border bg-background p-2 font-mono text-xs"
                />
              </div>
            );
          })}
          {!isLoading && drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody left to tell. Everyone who asked has already been notified.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={sendMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={selected.length === 0 || sendMutation.isPending}
            style={{ backgroundColor: BRAND }}
          >
            {sendMutation.isPending
              ? "Sending…"
              : `Send ${selected.length} ${selected.length === 1 ? "note" : "notes"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
