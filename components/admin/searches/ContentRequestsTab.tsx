"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND, timeAgo, type ContentRequestItem } from "./shared";

/**
 * The four states a request moves through, in the order work actually happens.
 * "rejected" is the escape hatch for things worth remembering we said no to —
 * deleting is for junk, rejecting is for a decision.
 */
const STATUSES = [
  { value: "requested", label: "Asked for", help: "An actor wanted this. Nothing done yet." },
  { value: "planned", label: "I'll add it", help: "On your list to source." },
  { value: "added", label: "Added", help: "It's in the library now." },
  { value: "rejected", label: "Not doing", help: "Decided against, kept as a record." },
] as const;

function statusStyle(status: string): string {
  if (status === "added") return "border-green-300 bg-green-50 text-green-800";
  if (status === "planned") return "border-blue-300 bg-blue-50 text-blue-800";
  if (status === "rejected") return "border-border bg-muted/50 text-muted-foreground";
  return "border-amber-300 bg-amber-50 text-amber-800";
}

interface EditDraft {
  id: number | null;
  play_title: string;
  author: string;
  character_name: string;
  status: string;
}

const BLANK_DRAFT: EditDraft = {
  id: null,
  play_title: "",
  author: "",
  character_name: "",
  status: "requested",
};

export function ContentRequestsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContentRequestItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-content-requests"],
    queryFn: async () => {
      const res = await api.get<{ requests: ContentRequestItem[] }>("/api/admin/content-requests");
      return res.data;
    },
    staleTime: 60_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-content-requests"] });

  const saveMutation = useMutation({
    mutationFn: async (d: EditDraft) => {
      const body = {
        play_title: d.play_title,
        author: d.author,
        character_name: d.character_name,
        status: d.status,
      };
      if (d.id == null) {
        const res = await api.post("/api/admin/content-requests", body);
        return res.data as { created: boolean };
      }
      const res = await api.patch(`/api/admin/content-requests/${d.id}`, body);
      return res.data as { merged_into?: number };
    },
    onSuccess: (result) => {
      setDraft(null);
      if (result && "merged_into" in result && result.merged_into) {
        setNotice("That title already existed, so the two were folded into one row.");
      } else if (result && "created" in result && result.created === false) {
        setNotice("Already on the list — bumped its request count instead.");
      } else {
        setNotice(null);
      }
      invalidate();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await api.patch(`/api/admin/content-requests/${id}`, { status });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/content-requests/${id}`);
    },
    onSuccess: () => {
      setPendingDelete(null);
      invalidate();
    },
  });

  const requests = useMemo(() => data?.requests ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length };
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        r.play_title.toLowerCase().includes(needle) ||
        (r.author ?? "").toLowerCase().includes(needle) ||
        (r.character_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [requests, statusFilter, search]);

  const saving = saveMutation.isPending;

  return (
    <div className="space-y-4">
      <section className="border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">What actors asked you to add</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every row is a title someone searched for and couldn&apos;t find. Fix a typo, set
              where it stands, or bin the junk.
            </p>
          </div>
          <Button
            size="sm"
            className="w-full gap-2 sm:w-auto"
            style={{ backgroundColor: BRAND }}
            onClick={() => setDraft({ ...BLANK_DRAFT })}
          >
            <IconPlus className="h-4 w-4" />
            Add one
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[{ value: "all", label: "All" }, ...STATUSES].map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(s.value)}
              className={`border px-3 py-1.5 text-xs transition-colors ${
                statusFilter === s.value ? "bg-muted/60" : "bg-background hover:bg-muted/30"
              }`}
              style={{ borderColor: statusFilter === s.value ? BRAND : undefined }}
            >
              {s.label}
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {counts[s.value] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="relative mt-3 w-full sm:w-72">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Find a title, author or character…"
          />
        </div>

        {notice && (
          <p className="mt-3 border-l-2 pl-3 text-xs" style={{ borderColor: BRAND, color: BRAND }}>
            {notice}
          </p>
        )}
      </section>

      <section className="border border-border bg-card">
        {isLoading ? (
          <p className="py-10 text-center text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {requests.length === 0
              ? "Nobody has requested anything yet."
              : "Nothing matches that filter."}
          </p>
        ) : (
          <>
            {/* Mobile */}
            <ul className="divide-y divide-border md:hidden">
              {visible.map((r) => (
                <li key={r.id} className="space-y-3 p-4">
                  <div>
                    <p className="text-sm font-medium">{r.play_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.author || "author unknown"}
                      {r.character_name ? ` · ${r.character_name}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Asked for {r.request_count}×{" "}
                      <span className="opacity-70">· last {timeAgo(r.last_requested_at)}</span>
                    </p>
                  </div>
                  <select
                    value={r.status}
                    onChange={(e) => statusMutation.mutate({ id: r.id, status: e.target.value })}
                    className={`min-h-[44px] w-full rounded border px-2 py-2 text-xs ${statusStyle(r.status)}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] flex-1 gap-2"
                      onClick={() =>
                        setDraft({
                          id: r.id,
                          play_title: r.play_title,
                          author: r.author ?? "",
                          character_name: r.character_name ?? "",
                          status: r.status,
                        })
                      }
                    >
                      <IconPencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] flex-1 gap-2 text-destructive"
                      onClick={() => setPendingDelete(r)}
                    >
                      <IconTrash className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Title
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Author
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Character
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide">
                      Asked
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Last asked
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Where it stands
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide">
                      Edit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">{r.play_title}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.author || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.character_name || "—"}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {r.request_count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {timeAgo(r.last_requested_at)}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={r.status}
                          onChange={(e) =>
                            statusMutation.mutate({ id: r.id, status: e.target.value })
                          }
                          className={`rounded border px-2 py-1 text-xs ${statusStyle(r.status)}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${r.play_title}`}
                            onClick={() =>
                              setDraft({
                                id: r.id,
                                play_title: r.play_title,
                                author: r.author ?? "",
                                character_name: r.character_name ?? "",
                                status: r.status,
                              })
                            }
                          >
                            <IconPencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${r.play_title}`}
                            className="text-destructive hover:text-destructive"
                            onClick={() => setPendingDelete(r)}
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Edit / add */}
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id == null ? "Add a request" : "Edit request"}</DialogTitle>
            <DialogDescription>
              {draft?.id == null
                ? "Track something you want in the library, whether an actor asked or not."
                : "Fix what got typed. Renaming onto a title that already exists merges the two."}
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cr-title">Title</Label>
                <Input
                  id="cr-title"
                  value={draft.play_title}
                  autoFocus
                  onChange={(e) => setDraft({ ...draft, play_title: e.target.value })}
                  placeholder="Death of a Salesman"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cr-author">Author</Label>
                <Input
                  id="cr-author"
                  value={draft.author}
                  onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                  placeholder="Leave blank if you don't know"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cr-character">Character</Label>
                <Input
                  id="cr-character"
                  value={draft.character_name}
                  onChange={(e) => setDraft({ ...draft, character_name: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cr-status">Where it stands</Label>
                <select
                  id="cr-status"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label} — {s.help}
                    </option>
                  ))}
                </select>
              </div>
              {saveMutation.isError && (
                <p className="text-xs text-destructive">
                  {(saveMutation.error as { response?: { data?: { detail?: string } } })?.response
                    ?.data?.detail || "Could not save. Try again."}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              style={{ backgroundColor: BRAND }}
              disabled={saving || !draft?.play_title.trim()}
              onClick={() => draft && saveMutation.mutate(draft)}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this request?"
        description={
          pendingDelete
            ? `“${pendingDelete.play_title}” will be removed from the list. If an actor searches for it again it'll come back as a new request.`
            : ""
        }
        isLoading={deleteMutation.isPending}
        onConfirm={async () => {
          if (pendingDelete) await deleteMutation.mutateAsync(pendingDelete.id);
        }}
      />
    </div>
  );
}
