"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { IconSearch, IconEdit, IconLoader2 } from "@tabler/icons-react";

export interface AdminMonologueItem {
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
  word_count: number;
  estimated_duration_seconds: number;
  scene_description: string | null;
}

export default function AdminMonologuesPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [results, setResults] = useState<AdminMonologueItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState<AdminMonologueItem | null>(null);

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
      body: Partial<{
        title: string;
        text: string;
        character_name: string;
        stage_directions: string | null;
        character_gender: string | null;
        character_age_range: string | null;
        primary_emotion: string | null;
        themes: string[] | null;
        scene_description: string | null;
      }>;
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditModal(m)}
                  >
                    <IconEdit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {editModal && (
        <EditMonologueModal
          monologue={editModal}
          onClose={() => setEditModal(null)}
          onSave={(body) => {
            updateMutation.mutate({ id: editModal.id, body });
          }}
          isSaving={updateMutation.isPending}
        />
      )}
    </div>
  );
}

type EditBody = {
  title?: string;
  text?: string;
  character_name?: string;
  stage_directions?: string | null;
  character_gender?: string | null;
  character_age_range?: string | null;
  primary_emotion?: string | null;
  themes?: string[] | null;
  scene_description?: string | null;
};

function EditMonologueModal({
  monologue,
  onClose,
  onSave,
  isSaving,
}: {
  monologue: AdminMonologueItem;
  onClose: () => void;
  onSave: (body: EditBody) => void;
  isSaving: boolean;
}) {
  const [title, setTitle] = useState(monologue.title);
  const [text, setText] = useState(monologue.text);
  const [characterName, setCharacterName] = useState(monologue.character_name);
  const [stageDirections, setStageDirections] = useState(
    monologue.stage_directions ?? ""
  );
  const [characterGender, setCharacterGender] = useState(
    monologue.character_gender ?? ""
  );
  const [characterAgeRange, setCharacterAgeRange] = useState(
    monologue.character_age_range ?? ""
  );
  const [primaryEmotion, setPrimaryEmotion] = useState(
    monologue.primary_emotion ?? ""
  );
  const [themesStr, setThemesStr] = useState(
    (monologue.themes ?? []).join(", ")
  );
  const [sceneDescription, setSceneDescription] = useState(
    monologue.scene_description ?? ""
  );

  const handleSave = () => {
    const themes = themesStr
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({
      title: title || undefined,
      text: text || undefined,
      character_name: characterName || undefined,
      stage_directions: stageDirections || null,
      character_gender: characterGender || null,
      character_age_range: characterAgeRange || null,
      primary_emotion: primaryEmotion || null,
      themes: themes.length ? themes : null,
      scene_description: sceneDescription || null,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit monologue (ID: {monologue.id})</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-character">Character name</Label>
            <Input
              id="edit-character"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-text">Text</Label>
            <Textarea
              id="edit-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-stage">Stage directions</Label>
            <Textarea
              id="edit-stage"
              value={stageDirections}
              onChange={(e) => setStageDirections(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-gender">Character gender</Label>
              <Input
                id="edit-gender"
                value={characterGender}
                onChange={(e) => setCharacterGender(e.target.value)}
                placeholder="male, female, any"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-age">Character age range</Label>
              <Input
                id="edit-age"
                value={characterAgeRange}
                onChange={(e) => setCharacterAgeRange(e.target.value)}
                placeholder="20s, 30-40, 50+"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-emotion">Primary emotion</Label>
            <Input
              id="edit-emotion"
              value={primaryEmotion}
              onChange={(e) => setPrimaryEmotion(e.target.value)}
              placeholder="e.g. sadness, anger"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-themes">Themes (comma-separated)</Label>
            <Input
              id="edit-themes"
              value={themesStr}
              onChange={(e) => setThemesStr(e.target.value)}
              placeholder="love, death, identity"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-scene">Scene description</Label>
            <Textarea
              id="edit-scene"
              value={sceneDescription}
              onChange={(e) => setSceneDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
