"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadScene, type SceneUploadData, type SceneLineUploadData } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Loader2, Plus, Trash2 } from "lucide-react";

interface SceneUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SceneUploadModal({
  open,
  onOpenChange,
  onSuccess,
}: SceneUploadModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<SceneUploadData>({
    title: "",
    play_title: "",
    author: "",
    description: "",
    character_1_name: "",
    character_2_name: "",
    character_1_gender: undefined,
    character_2_gender: undefined,
    character_1_age_range: undefined,
    character_2_age_range: undefined,
    setting: "",
    context_before: "",
    context_after: "",
    lines: [
      { character_name: "", text: "", stage_direction: "" },
      { character_name: "", text: "", stage_direction: "" },
    ],
  });

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { character_name: "", text: "", stage_direction: "" }],
    });
  };

  const removeLine = (index: number) => {
    if (formData.lines.length <= 2) {
      toast.error("Scene must have at least 2 lines");
      return;
    }
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const updateLine = (index: number, field: keyof SceneLineUploadData, value: string) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.play_title || !formData.author ||
        !formData.character_1_name || !formData.character_2_name) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate lines
    const validLines = formData.lines.filter(line => line.character_name && line.text);
    if (validLines.length < 2) {
      toast.error("Scene must have at least 2 lines with character name and text");
      return;
    }

    setIsLoading(true);

    try {
      await uploadScene({
        ...formData,
        lines: validLines,
      });
      toast.success("Scene uploaded successfully! You can now rehearse it with Scene Partner.");

      // Reset form
      setFormData({
        title: "",
        play_title: "",
        author: "",
        description: "",
        character_1_name: "",
        character_2_name: "",
        character_1_gender: undefined,
        character_2_gender: undefined,
        character_1_age_range: undefined,
        character_2_age_range: undefined,
        setting: "",
        context_before: "",
        context_after: "",
        lines: [
          { character_name: "", text: "", stage_direction: "" },
          { character_name: "", text: "", stage_direction: "" },
        ],
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Upload error:", error);
      const errorMessage = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined;
      toast.error(errorMessage || "Failed to upload scene");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Your Scene</DialogTitle>
          <DialogDescription>
            Upload a two-person scene to rehearse with AI Scene Partner.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Scene Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Scene Information</h3>

            <div className="space-y-2">
              <Label htmlFor="title">Scene Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Kitchen Confrontation"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

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

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Brief description of what happens in this scene..."
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setting">Setting (Optional)</Label>
              <Input
                id="setting"
                placeholder="e.g., A kitchen at night"
                value={formData.setting || ""}
                onChange={(e) => setFormData({ ...formData, setting: e.target.value })}
              />
            </div>
          </div>

          {/* Characters */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Characters</h3>

            {/* Character 1 */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Character 1</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="char1_name">Name *</Label>
                  <Input
                    id="char1_name"
                    placeholder="e.g., Sarah"
                    value={formData.character_1_name}
                    onChange={(e) => setFormData({ ...formData, character_1_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char1_gender">Gender</Label>
                  <Select
                    value={formData.character_1_gender || "__none__"}
                    onValueChange={(v) => setFormData({ ...formData, character_1_gender: v === "__none__" ? undefined : v })}
                  >
                    <SelectTrigger id="char1_gender">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="non-binary">Non-binary</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char1_age">Age Range</Label>
                  <Input
                    id="char1_age"
                    placeholder="e.g., 20s"
                    value={formData.character_1_age_range || ""}
                    onChange={(e) => setFormData({ ...formData, character_1_age_range: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Character 2 */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Character 2</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="char2_name">Name *</Label>
                  <Input
                    id="char2_name"
                    placeholder="e.g., John"
                    value={formData.character_2_name}
                    onChange={(e) => setFormData({ ...formData, character_2_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char2_gender">Gender</Label>
                  <Select
                    value={formData.character_2_gender || "__none__"}
                    onValueChange={(v) => setFormData({ ...formData, character_2_gender: v === "__none__" ? undefined : v })}
                  >
                    <SelectTrigger id="char2_gender">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="non-binary">Non-binary</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char2_age">Age Range</Label>
                  <Input
                    id="char2_age"
                    placeholder="e.g., 30s"
                    value={formData.character_2_age_range || ""}
                    onChange={(e) => setFormData({ ...formData, character_2_age_range: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Scene Lines */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Dialogue Lines</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4 mr-1" />
                Add Line
              </Button>
            </div>

            <div className="space-y-3">
              {formData.lines.map((line, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Line {index + 1}</span>
                    {formData.lines.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Character</Label>
                      <Select
                        value={line.character_name || undefined}
                        onValueChange={(v) => updateLine(index, "character_name", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={formData.character_1_name || "Character 1"}>
                            {formData.character_1_name || "Character 1"}
                          </SelectItem>
                          <SelectItem value={formData.character_2_name || "Character 2"}>
                            {formData.character_2_name || "Character 2"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label>Text</Label>
                      <Textarea
                        placeholder="Dialogue text..."
                        value={line.text}
                        onChange={(e) => updateLine(index, "text", e.target.value)}
                        rows={2}
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Stage Direction (Optional)</Label>
                    <Input
                      placeholder="e.g., [angrily]"
                      value={line.stage_direction || ""}
                      onChange={(e) => updateLine(index, "stage_direction", e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Context */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Context (Optional)</h3>

            <div className="space-y-2">
              <Label htmlFor="context_before">What happens before this scene?</Label>
              <Textarea
                id="context_before"
                placeholder="Context leading up to this scene..."
                value={formData.context_before || ""}
                onChange={(e) => setFormData({ ...formData, context_before: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="context_after">What happens after this scene?</Label>
              <Textarea
                id="context_after"
                placeholder="Context following this scene..."
                value={formData.context_after || ""}
                onChange={(e) => setFormData({ ...formData, context_after: e.target.value })}
                rows={2}
              />
            </div>
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
                  Upload Scene
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
