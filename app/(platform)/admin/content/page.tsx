"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconSearch, IconEdit, IconLoader2, IconTrash } from "@tabler/icons-react";
import { EditMonologueModal, type AdminMonologueItem, type EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { getFilmTvScriptUrl } from "@/lib/utils";

export type { AdminMonologueItem };

type Tab = "monologues" | "film-tv";

// ---------- Film/TV Section ----------

interface FilmTvAdminItem {
  id: number;
  title: string;
  year: number | null;
  type: string | null;
  imdb_id: string;
  imsdb_url: string | null;
}

function FilmTvSection() {
  const [idInput, setIdInput] = useState("");
  const [item, setItem] = useState<FilmTvAdminItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptUrlValue, setScriptUrlValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function runLookup() {
    const raw = idInput.trim();
    if (!raw || !/^\d+$/.test(raw)) {
      setError("Enter a numeric Film/TV reference ID.");
      setItem(null);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<FilmTvAdminItem>(`/api/admin/film-tv?id=${raw}`);
      setItem(res.data);
      setScriptUrlValue(res.data.imsdb_url?.trim() ?? getFilmTvScriptUrl(res.data));
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Lookup failed.";
      setError(String(message));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    try {
      const res = await api.patch<FilmTvAdminItem>(`/api/admin/film-tv/${item.id}`, {
        imsdb_url: scriptUrlValue.trim() || null,
      });
      setItem(res.data);
      setScriptUrlValue(res.data.imsdb_url?.trim() ?? getFilmTvScriptUrl(res.data));
      toast.success("Script link updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Film/TV script links</CardTitle>
          <p className="text-sm text-muted-foreground">
            Look up a film/TV reference by ID and set or clear the IMSDb script URL override.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Film/TV reference ID (e.g. 42)"
              type="number"
              value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runLookup()}
              className="max-w-xs"
            />
            <Button onClick={runLookup} disabled={loading}>
              {loading ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconSearch className="h-4 w-4" />
              )}
              <span className="ml-2">Look up</span>
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {item && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{item.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {item.year ?? "-"} · {item.type ?? "-"} · IMDb {item.imdb_id}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="admin-film-tv-script-url">Script URL (IMSDb override)</Label>
              <Input
                id="admin-film-tv-script-url"
                value={scriptUrlValue}
                onChange={(e) => setScriptUrlValue(e.target.value)}
                placeholder="https://imsdb.com/scripts/Godfather.html"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the auto-generated URL from the title. Set a full URL to override.
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ---------- Monologues Section ----------

function MonologuesSection() {
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
    <>
      <Card>
        <CardHeader>
          <CardTitle>Find &amp; edit monologues</CardTitle>
          <p className="text-sm text-muted-foreground">
            Search by monologue ID, title, character name, or play title.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="e.g. 12345 or Hamlet"
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
    </>
  );
}

// ---------- Main Page ----------

export default function AdminContentPage() {
  const [tab, setTab] = useState<Tab>("monologues");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-3">
        <Button
          variant={tab === "monologues" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setTab("monologues")}
        >
          Monologues
        </Button>
        <Button
          variant={tab === "film-tv" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setTab("film-tv")}
        >
          Film/TV
        </Button>
      </div>

      <div className="space-y-6">
        {tab === "monologues" ? <MonologuesSection /> : <FilmTvSection />}
      </div>
    </div>
  );
}
