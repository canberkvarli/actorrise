"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, User } from "lucide-react";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import api from "@/lib/api";
import { toast } from "sonner";

export interface NewSceneCharacter {
  id: string;
  name: string;
  voiceURI: string;
}

export interface NewSceneLine {
  characterName: string;
  text: string;
}

interface NewSceneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NewSceneModal({ open, onOpenChange, onSuccess }: NewSceneModalProps) {
  const router = useRouter();
  const { voices } = useSpeechSynthesis({ rate: 1.0, volume: 1.0 });

  const [title, setTitle] = useState("");
  const [myCharacter, setMyCharacter] = useState("");
  const [characters, setCharacters] = useState<NewSceneCharacter[]>([]);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<NewSceneLine[]>([]);
  const [draftLineCharacter, setDraftLineCharacter] = useState("");
  const [draftLineText, setDraftLineText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const characterNames = [myCharacter, ...characters.map((c) => c.name)].filter(Boolean);

  const addCharacter = useCallback(() => {
    setCharacters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", voiceURI: "" },
    ]);
  }, []);

  const updateCharacter = useCallback(
    (id: string, updates: Partial<NewSceneCharacter>) => {
      setCharacters((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const removeCharacter = useCallback((id: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const saveLine = useCallback(() => {
    const char = draftLineCharacter.trim();
    const text = draftLineText.trim();
    if (!char || !text) return;
    setLines((prev) => [...prev, { characterName: char, text }]);
    setDraftLineCharacter("");
    setDraftLineText("");
  }, [draftLineCharacter, draftLineText]);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title is required.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one line.");
      return;
    }
    const distinctCharacters = new Set(lines.map((l) => l.characterName.trim()).filter(Boolean));
    if (distinctCharacters.size < 2) {
      toast.error("A scene needs at least two characters. Add lines for at least two different character names.");
      return;
    }
    const body = lines.map((l) => `${l.characterName}: ${l.text}`).join("\n");
    setSubmitting(true);
    try {
      const { data } = await api.post<{ id: number; num_scenes_extracted: number }>(
        "/api/scripts/from-text",
        {
          body,
          title: trimmedTitle,
          author: "Manual",
          description: description.trim() || undefined,
        }
      );
      toast.success("Scene created.");
      onOpenChange(false);
      setTitle("");
      setMyCharacter("");
      setCharacters([]);
      setDescription("");
      setLines([]);
      onSuccess?.();
      router.push(`/my-scripts/${data.id}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Failed to create script";
      toast.error(typeof msg === "string" ? msg : "Failed to create script");
    } finally {
      setSubmitting(false);
    }
  }, [title, description, lines, onOpenChange, onSuccess, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">New Script</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Create a script from scratch. Add a title, characters, and lines below. No file needed.
        </p>

        <div className="space-y-6">
          <div>
            <Label htmlFor="new-scene-title">Title</Label>
            <Input
              id="new-scene-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Scene or script title"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="new-scene-my-char">Who are you playing? (optional)</Label>
            <Input
              id="new-scene-my-char"
              value={myCharacter}
              onChange={(e) => setMyCharacter(e.target.value)}
              placeholder="Your character's name"
              className="mt-2"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Who else is in the scene?</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCharacter} className="gap-1">
                <Plus className="w-4 h-4" />
                Add character
              </Button>
            </div>
            {characters.map((c) => (
              <div key={c.id} className="flex gap-2 items-center mt-2">
                <Input
                  value={c.name}
                  onChange={(e) => updateCharacter(c.id, { name: e.target.value })}
                  placeholder="Character name"
                  className="flex-1"
                />
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[140px]"
                  value={c.voiceURI}
                  onChange={(e) => updateCharacter(c.id, { voiceURI: e.target.value })}
                >
                  <option value="">Select voice</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeCharacter(c.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="new-scene-desc">Description (optional)</Label>
            <Textarea
              id="new-scene-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the scene"
              rows={2}
              className="mt-2"
            />
          </div>

          <div>
            <Label className="mb-2 block">Lines</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Add dialogue. Select the character for each line.
            </p>
            {lines.length > 0 && (
              <ul className="space-y-2 mb-3 rounded-lg border border-border p-3 bg-muted/30">
                {lines.map((line, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-muted-foreground">{line.characterName}:</span>
                    <span className="flex-1 truncate">{line.text}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeLine(i)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 flex-wrap items-end">
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm w-32"
                value={draftLineCharacter}
                onChange={(e) => setDraftLineCharacter(e.target.value)}
              >
                <option value="">Select character</option>
                {characterNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <Input
                value={draftLineText}
                onChange={(e) => setDraftLineText(e.target.value)}
                placeholder="Type line here..."
                className="flex-1 min-w-[160px]"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), saveLine())}
              />
              <Button type="button" variant="outline" size="sm" onClick={saveLine}>
                Save line
              </Button>
            </div>
            {characterNames.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Add &quot;Who are you playing&quot; or another character above first.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating..." : "Create script"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
