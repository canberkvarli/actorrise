"use client";

import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconLoader2 } from "@tabler/icons-react";

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

export type EditMonologueBody = {
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

export interface EditMonologueModalProps {
  /** When provided, the modal uses this data and does not fetch. */
  monologue?: AdminMonologueItem | null;
  /** When provided and monologue is not, the modal fetches by ID when opened. */
  monologueId?: number | null;
  onClose: () => void;
  onSave: (body: EditMonologueBody) => void;
  isSaving?: boolean;
}

export function EditMonologueModal({
  monologue: monologueProp,
  monologueId,
  onClose,
  onSave,
  isSaving = false,
}: EditMonologueModalProps) {
  const [monologue, setMonologue] = useState<AdminMonologueItem | null>(monologueProp ?? null);
  const [loading, setLoading] = useState(!!monologueId && !monologueProp);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [stageDirections, setStageDirections] = useState("");
  const [characterGender, setCharacterGender] = useState("");
  const [characterAgeRange, setCharacterAgeRange] = useState("");
  const [primaryEmotion, setPrimaryEmotion] = useState("");
  const [themesStr, setThemesStr] = useState("");
  const [sceneDescription, setSceneDescription] = useState("");

  // When opening with monologueId, fetch
  useEffect(() => {
    if (monologueProp != null) {
      setMonologue(monologueProp);
      setLoading(false);
      setFetchError(null);
      setTitle(monologueProp.title);
      setText(monologueProp.text);
      setCharacterName(monologueProp.character_name);
      setStageDirections(monologueProp.stage_directions ?? "");
      setCharacterGender(monologueProp.character_gender ?? "");
      setCharacterAgeRange(monologueProp.character_age_range ?? "");
      setPrimaryEmotion(monologueProp.primary_emotion ?? "");
      setThemesStr((monologueProp.themes ?? []).join(", "));
      setSceneDescription(monologueProp.scene_description ?? "");
      return;
    }
    if (monologueId == null) {
      setMonologue(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    api
      .get<AdminMonologueItem[]>(`/api/admin/monologues?id=${monologueId}`)
      .then((res) => {
        const item = res.data?.[0];
        if (!item) {
          setFetchError("Monologue not found");
          setMonologue(null);
          return;
        }
        setMonologue(item);
        setTitle(item.title);
        setText(item.text);
        setCharacterName(item.character_name);
        setStageDirections(item.stage_directions ?? "");
        setCharacterGender(item.character_gender ?? "");
        setCharacterAgeRange(item.character_age_range ?? "");
        setPrimaryEmotion(item.primary_emotion ?? "");
        setThemesStr((item.themes ?? []).join(", "));
        setSceneDescription(item.scene_description ?? "");
      })
      .catch((err) => {
        setFetchError(err?.message ?? "Failed to load monologue");
        setMonologue(null);
      })
      .finally(() => setLoading(false));
  }, [monologueId, monologueProp]);

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

  const open = monologueProp != null || monologueId != null;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {loading
              ? "Loading..."
              : fetchError
                ? "Error"
                : monologue
                  ? `Edit monologue (ID: ${monologue.id})`
                  : "Edit monologue"}
          </DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {fetchError && !loading && (
          <p className="text-sm text-destructive py-4">{fetchError}</p>
        )}
        {monologue && !loading && (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
