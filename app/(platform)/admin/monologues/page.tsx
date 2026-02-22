"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconSearch, IconEdit, IconLoader2, IconTrash } from "@tabler/icons-react";
import { EditMonologueModal, type AdminMonologueItem, type EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export type { AdminMonologueItem };

export default function AdminMonologuesPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [results, setResults] = useState<AdminMonologueItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState<AdminMonologueItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMonologueItem | null>(null);

  async function runSearch() {
    const raw = searchInput.trim();
    if (!raw) {
      setSearchError("Enter an ID or search term (title, character, play).");
      return;
    }
    setSearchError(null);
    setLoading(true);
    try {
      const isNumeric = /^\d+$/.test(raw);
      const url = isNumeric
        ? `/api/admin/monologues?id=${raw}`
        : `/api/admin/monologues?q=${encodeURIComponent(raw)}&limit=50`;
      const res = await api.get<AdminMonologueItem[]>(url);
      setResults(res.data);
      if (res.data.length === 0) toast.info("No monologues found.");
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : "Search failed.";
      setSearchError(String(message));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      body: EditMonologueBody;
    }) => {
      const res = await api.patch<AdminMonologueItem>(
        `/api/admin/monologues/${id}`,
        body
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["admin-monologues"] });
      setResults((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      setEditModal(null);
      toast.success("Monologue updated");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Update failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/monologues/${id}`);
    },
    onSuccess: (_, id) => {
      setResults((prev) => prev.filter((m) => m.id !== id));
      setDeleteTarget(null);
      toast.success("Monologue deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Delete failed");
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Find &amp; edit monologues</CardTitle>
          <p className="text-sm text-muted-foreground">
            Search by monologue ID, title, character name, or play title. Use this to fix corrupted data or respond to user reports.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="e.g. 12345 or sadf or Hamlet"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              className="max-w-sm"
            />
            <Button onClick={runSearch} disabled={loading}>
              {loading ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconSearch className="h-4 w-4" />
              )}
              <span className="ml-2">Find</span>
            </Button>
          </div>
          {searchError && (
            <p className="text-sm text-destructive">{searchError}</p>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{results.length} result(s)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {results.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-muted-foreground mx-2">·</span>
                    <span>{m.character_name}</span>
                    <span className="text-muted-foreground mx-2">·</span>
                    <span className="text-muted-foreground">
                      {m.play_title} by {m.author}
                    </span>
                    <span className="text-muted-foreground ml-2 text-sm">
                      (ID: {m.id})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditModal(m)}
                    >
                      <IconEdit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(m)}
                    >
                      <IconTrash className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <EditMonologueModal
        monologue={editModal}
        onClose={() => setEditModal(null)}
        onSave={(body) => {
          if (editModal) updateMutation.mutate({ id: editModal.id, body });
        }}
        isSaving={updateMutation.isPending}
      />

      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete monologue"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.title}" (${deleteTarget.character_name}, ID: ${deleteTarget.id})? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

