"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconSearch, IconEdit, IconLoader2, IconTrash, IconFileSearch } from "@tabler/icons-react";
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
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Film/TV reference ID (e.g. 42)"
          type="number"
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runLookup()}
          className="w-full sm:w-auto sm:max-w-xs"
        />
        <Button onClick={runLookup} disabled={loading} className="w-full gap-2 sm:w-auto">
          {loading ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconSearch className="h-4 w-4" />}
          Look up
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Look up a film/TV reference by ID and set or clear the IMSDb script URL override.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {item && (
        <div className="border border-border/60 bg-card/40 p-4 space-y-4">
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">
              {item.year ?? "-"} · {item.type ?? "-"} · IMDb {item.imdb_id}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-film-tv-script-url">Script URL (IMSDb override)</Label>
            <Input
              id="admin-film-tv-script-url"
              value={scriptUrlValue}
              onChange={(e) => setScriptUrlValue(e.target.value)}
              placeholder="https://imsdb.com/scripts/Godfather.html"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the auto-generated URL from the title. Set a full URL to override.
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full gap-2 sm:w-auto">
            {saving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      )}
    </div>
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
    mutationFn: async ({ id, body }: { id: number; body: EditMonologueBody }) => {
      const res = await api.patch<AdminMonologueItem>(`/api/admin/monologues/${id}`, body);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["admin-monologues"] });
      setResults((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
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
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="e.g. 12345 or Hamlet"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          className="w-full sm:w-auto sm:max-w-sm"
        />
        <Button onClick={runSearch} disabled={loading} className="w-full gap-2 sm:w-auto">
          {loading ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconSearch className="h-4 w-4" />}
          Find
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Search by monologue ID, title, character name, or play title.
      </p>
      {searchError && <p className="text-sm text-destructive">{searchError}</p>}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-2">
            {results.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 border border-border/50 bg-card/30 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{m.title}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span>{m.character_name}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {m.play_title} by {m.author}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">#{m.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditModal(m)}
                    className="flex-1 gap-1 sm:flex-none"
                  >
                    <IconEdit className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive sm:flex-none"
                    onClick={() => setDeleteTarget(m)}
                  >
                    <IconTrash className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
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
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ---------- Main Page ----------

const TABS: { key: Tab; label: string }[] = [
  { key: "monologues", label: "Monologues" },
  { key: "film-tv", label: "Film / TV" },
];

export default function AdminContentPage() {
  const [tab, setTab] = useState<Tab>("monologues");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brand text-2xl font-semibold tracking-[-0.02em] flex items-center gap-2">
          <IconFileSearch className="h-6 w-6 text-primary" />
          Content
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find, edit, or remove monologues and set film/TV script links.
        </p>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === t.key
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          {tab === "monologues" ? <MonologuesSection /> : <FilmTvSection />}
        </CardContent>
      </Card>
    </div>
  );
}
