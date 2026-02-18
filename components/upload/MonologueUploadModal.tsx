"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadMonologue, type MonologueUploadData } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

interface MonologueUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function MonologueUploadModal({
  open,
  onOpenChange,
  onSuccess,
}: MonologueUploadModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<MonologueUploadData>({
    title: "",
    character_name: "",
    text: "",
    stage_directions: "",
    play_title: "",
    author: "",
    character_gender: undefined,
    character_age_range: undefined,
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.character_name || !formData.text || !formData.play_title || !formData.author) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);

    try {
      await uploadMonologue(formData);
      toast.success("Monologue uploaded successfully!");

      // Reset form
      setFormData({
        title: "",
        character_name: "",
        text: "",
        stage_directions: "",
        play_title: "",
        author: "",
        character_gender: undefined,
        character_age_range: undefined,
        notes: "",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error?.response?.data?.detail || "Failed to upload monologue");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Your Monologue</DialogTitle>
          <DialogDescription>
            Upload your own script or monologue. It will be analyzed by AI and saved to your collection.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Monologue Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Sarah's Opening Monologue"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          {/* Character Name */}
          <div className="space-y-2">
            <Label htmlFor="character_name">Character Name *</Label>
            <Input
              id="character_name"
              placeholder="e.g., Sarah"
              value={formData.character_name}
              onChange={(e) => setFormData({ ...formData, character_name: e.target.value })}
              required
            />
          </div>

          {/* Play Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="play_title">Play/Script Title *</Label>
              <Input
                id="play_title"
                placeholder="e.g., My Original Script"
                value={formData.play_title}
                onChange={(e) => setFormData({ ...formData, play_title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">Author *</Label>
              <Input
                id="author"
                placeholder="e.g., Your Name"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Character Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="character_gender">Character Gender (Optional)</Label>
              <Select
                value={formData.character_gender || "__none__"}
                onValueChange={(v) => setFormData({ ...formData, character_gender: v === "__none__" ? undefined : v })}
              >
                <SelectTrigger id="character_gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select gender</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="any">Any</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="character_age_range">Age Range (Optional)</Label>
              <Input
                id="character_age_range"
                placeholder="e.g., 20s, 30-40, 50+"
                value={formData.character_age_range || ""}
                onChange={(e) => setFormData({ ...formData, character_age_range: e.target.value })}
              />
            </div>
          </div>

          {/* Monologue Text */}
          <div className="space-y-2">
            <Label htmlFor="text">Monologue Text *</Label>
            <Textarea
              id="text"
              placeholder="Paste your monologue text here..."
              value={formData.text}
              onChange={(e) => setFormData({ ...formData, text: e.target.value })}
              required
              rows={10}
              className="font-mono"
            />
          </div>

          {/* Stage Directions */}
          <div className="space-y-2">
            <Label htmlFor="stage_directions">Stage Directions (Optional)</Label>
            <Textarea
              id="stage_directions"
              placeholder="e.g., [Enters from stage left, visibly upset]"
              value={formData.stage_directions || ""}
              onChange={(e) => setFormData({ ...formData, stage_directions: e.target.value })}
              rows={2}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Personal Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Your notes about this piece..."
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Monologue
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
