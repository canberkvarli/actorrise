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
import { useT } from "@/lib/i18n";
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
  const t = useT();
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
      toast.error(t("appAuditionsUploadScene.minLines"));
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
      toast.error(t("appAuditionsUpload.required"));
      return;
    }

    // Validate lines
    const validLines = formData.lines.filter(line => line.character_name && line.text);
    if (validLines.length < 2) {
      toast.error(t("appAuditionsUploadScene.minValidLines"));
      return;
    }

    setIsLoading(true);

    try {
      await uploadScene({
        ...formData,
        lines: validLines,
      });
      toast.success(t("appAuditionsUploadScene.success"));

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
      toast.error(errorMessage || t("appAuditionsUploadScene.failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("appAuditionsUploadScene.title")}</DialogTitle>
          <DialogDescription>
            {t("appAuditionsUploadScene.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Scene Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">{t("appAuditionsUploadScene.info")}</h3>

            <div className="space-y-2">
              <Label htmlFor="title">{t("appAuditionsUploadScene.fieldTitle")}</Label>
              <Input
                id="title"
                placeholder={t("appAuditionsUploadScene.titlePlaceholder")}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="play_title">{t("appAuditionsUpload.playTitle")}</Label>
                <Input
                  id="play_title"
                  placeholder={t("appAuditionsUpload.playPlaceholder")}
                  value={formData.play_title}
                  onChange={(e) => setFormData({ ...formData, play_title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="author">{t("appAuditionsUpload.author")}</Label>
                <Input
                  id="author"
                  placeholder={t("appAuditionsUpload.authorPlaceholder")}
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("appAuditionsUploadScene.descriptionLabel")}</Label>
              <Textarea
                id="description"
                placeholder={t("appAuditionsUploadScene.descriptionPlaceholder")}
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setting">{t("appAuditionsUploadScene.setting")}</Label>
              <Input
                id="setting"
                placeholder={t("appAuditionsUploadScene.settingPlaceholder")}
                value={formData.setting || ""}
                onChange={(e) => setFormData({ ...formData, setting: e.target.value })}
              />
            </div>
          </div>

          {/* Characters */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">{t("appAuditionsUploadScene.characters")}</h3>

            {/* Character 1 */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium">{t("appAuditionsUploadScene.character1")}</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="char1_name">{t("appAuditionsUploadScene.name")}</Label>
                  <Input
                    id="char1_name"
                    placeholder={t("appAuditionsUploadScene.char1Placeholder")}
                    value={formData.character_1_name}
                    onChange={(e) => setFormData({ ...formData, character_1_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char1_gender">{t("appAuditionsUploadScene.gender")}</Label>
                  <Select
                    value={formData.character_1_gender || "__none__"}
                    onValueChange={(v) => setFormData({ ...formData, character_1_gender: v === "__none__" ? undefined : v })}
                  >
                    <SelectTrigger id="char1_gender">
                      <SelectValue placeholder={t("appAuditionsUploadScene.select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("appAuditionsUploadScene.select")}</SelectItem>
                      <SelectItem value="male">{t("appAuditionsUpload.male")}</SelectItem>
                      <SelectItem value="female">{t("appAuditionsUpload.female")}</SelectItem>
                      <SelectItem value="non-binary">{t("appAuditionsUpload.nonBinary")}</SelectItem>
                      <SelectItem value="any">{t("appAuditionsUpload.any")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char1_age">{t("appAuditionsUploadScene.age")}</Label>
                  <Input
                    id="char1_age"
                    placeholder={t("appAuditionsUploadScene.age1Placeholder")}
                    value={formData.character_1_age_range || ""}
                    onChange={(e) => setFormData({ ...formData, character_1_age_range: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Character 2 */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium">{t("appAuditionsUploadScene.character2")}</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="char2_name">{t("appAuditionsUploadScene.name")}</Label>
                  <Input
                    id="char2_name"
                    placeholder={t("appAuditionsUploadScene.char2Placeholder")}
                    value={formData.character_2_name}
                    onChange={(e) => setFormData({ ...formData, character_2_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char2_gender">{t("appAuditionsUploadScene.gender")}</Label>
                  <Select
                    value={formData.character_2_gender || "__none__"}
                    onValueChange={(v) => setFormData({ ...formData, character_2_gender: v === "__none__" ? undefined : v })}
                  >
                    <SelectTrigger id="char2_gender">
                      <SelectValue placeholder={t("appAuditionsUploadScene.select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("appAuditionsUploadScene.select")}</SelectItem>
                      <SelectItem value="male">{t("appAuditionsUpload.male")}</SelectItem>
                      <SelectItem value="female">{t("appAuditionsUpload.female")}</SelectItem>
                      <SelectItem value="non-binary">{t("appAuditionsUpload.nonBinary")}</SelectItem>
                      <SelectItem value="any">{t("appAuditionsUpload.any")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="char2_age">{t("appAuditionsUploadScene.age")}</Label>
                  <Input
                    id="char2_age"
                    placeholder={t("appAuditionsUploadScene.age2Placeholder")}
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
              <h3 className="font-semibold text-lg">{t("appAuditionsUploadScene.lines")}</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4 mr-1" />
                {t("appAuditionsUploadScene.addLine")}
              </Button>
            </div>

            <div className="space-y-3">
              {formData.lines.map((line, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t("appAuditionsUploadScene.line", { n: index + 1 })}</span>
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
                      <Label>{t("appAuditionsUploadScene.character")}</Label>
                      <Select
                        value={line.character_name || undefined}
                        onValueChange={(v) => updateLine(index, "character_name", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("appAuditionsUploadScene.select")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={formData.character_1_name || "Character 1"}>
                            {formData.character_1_name || t("appAuditionsUploadScene.character1")}
                          </SelectItem>
                          <SelectItem value={formData.character_2_name || "Character 2"}>
                            {formData.character_2_name || t("appAuditionsUploadScene.character2")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label>{t("appAuditionsUploadScene.text")}</Label>
                      <Textarea
                        placeholder={t("appAuditionsUploadScene.textPlaceholder")}
                        value={line.text}
                        onChange={(e) => updateLine(index, "text", e.target.value)}
                        rows={2}
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("appAuditionsUploadScene.direction")}</Label>
                    <Input
                      placeholder={t("appAuditionsUploadScene.directionPlaceholder")}
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
            <h3 className="font-semibold text-lg">{t("appAuditionsUploadScene.context")}</h3>

            <div className="space-y-2">
              <Label htmlFor="context_before">{t("appAuditionsUploadScene.before")}</Label>
              <Textarea
                id="context_before"
                placeholder={t("appAuditionsUploadScene.beforePlaceholder")}
                value={formData.context_before || ""}
                onChange={(e) => setFormData({ ...formData, context_before: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="context_after">{t("appAuditionsUploadScene.after")}</Label>
              <Textarea
                id="context_after"
                placeholder={t("appAuditionsUploadScene.afterPlaceholder")}
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
              {t("appAuditionsUpload.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("appAuditionsUpload.uploading")}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  {t("appAuditionsUploadScene.submit")}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
