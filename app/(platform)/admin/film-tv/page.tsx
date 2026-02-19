"use client";

import React, { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconSearch, IconLoader2 } from "@tabler/icons-react";
import { getFilmTvScriptUrl } from "@/lib/utils";

interface FilmTvAdminItem {
  id: number;
  title: string;
  year: number | null;
  type: string | null;
  imdb_id: string;
  imsdb_url: string | null;
}

export default function AdminFilmTvPage() {
  const [idInput, setIdInput] = useState("");
  const [item, setItem] = useState<FilmTvAdminItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptUrlValue, setScriptUrlValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function runLookup() {
    const raw = idInput.trim();
    if (!raw || !/^\d+$/.test(raw)) {
      setError("Enter a numeric Film/TV reference ID (e.g. from the ID shown on dashboard or search when a film is selected).");
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Film/TV script links</CardTitle>
          <p className="text-sm text-muted-foreground">
            Look up a film/TV reference by ID and set or clear the IMSDb script URL override (e.g. when IMSDb uses &quot;Godfather&quot; but we display &quot;The Godfather&quot;). The ID is shown in the film detail panel on Dashboard and Search when you are a moderator.
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
              {item.year ?? "—"} · {item.type ?? "—"} · IMDb {item.imdb_id}
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
                Leave empty to use the auto-generated URL from the title. Set a full URL to override (e.g. when IMSDb slug differs).
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
