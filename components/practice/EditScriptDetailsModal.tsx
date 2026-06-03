"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GenreSelect } from "@/components/ui/genre-select";
import api from "@/lib/api";
import { SCRIPTS_QUERY_KEY, type UserScript } from "@/hooks/useScripts";

interface EditScriptDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: UserScript;
}

/**
 * Edit a script's metadata (title, author, genre, description). Replaces the
 * inline-editing that used to live on the standalone /practice/[id] page now
 * that the library is the single script surface.
 */
export function EditScriptDetailsModal({
  open,
  onOpenChange,
  script,
}: EditScriptDetailsModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(script.title ?? "");
  const [author, setAuthor] = useState(script.author ?? "");
  const [genre, setGenre] = useState(script.genre ?? "");
  const [description, setDescription] = useState(script.description ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title can't be empty.");
      return;
    }
    const update = {
      title: title.trim(),
      author: author.trim(),
      genre: genre.trim(),
      description: description.trim(),
    };
    setSaving(true);
    try {
      await api.patch(`/api/scripts/${script.id}`, update);
      // Refresh both the detail (scenes panel header) and the list (rail).
      queryClient.setQueryData<UserScript>(["scripts", script.id], (prev) =>
        prev ? { ...prev, ...update } : prev,
      );
      queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });
      toast.success("Saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit details</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Script title" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Author</label>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Genre</label>
            <GenreSelect value={genre} onValueChange={setGenre} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short synopsis"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditScriptDetailsModal;
