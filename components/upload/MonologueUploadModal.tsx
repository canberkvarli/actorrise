"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadMonologue, type MonologueUploadData } from "@/lib/api";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Upload, Loader2 } from "lucide-react";

interface MonologueUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new piece's id when the API returns one. */
  onSuccess?: (monologueId?: number) => void;
  /** Fields known before the actor types, e.g. from a published piece we point at. */
  prefill?: Partial<MonologueUploadData>;
  /** Replaces the dialog's description line. */
  description?: string;
}

export function MonologueUploadModal({
  open,
  onOpenChange,
  onSuccess,
  prefill,
  description,
}: MonologueUploadModalProps) {
  const t = useT();
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

  // A prefilled open starts from what we already know about the piece.
  useEffect(() => {
    if (open && prefill) setFormData((f) => ({ ...f, ...prefill }));
  }, [open, prefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.character_name || !formData.text || !formData.play_title || !formData.author) {
      toast.error(t("appAuditionsUpload.required"));
      return;
    }

    setIsLoading(true);

    try {
      const res = await uploadMonologue(formData);
      toast.success(t("appAuditionsUploadMono.success"));

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
      onSuccess?.((res?.data as { id?: number } | undefined)?.id);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error?.response?.data?.detail || t("appAuditionsUploadMono.failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("appAuditionsUploadMono.title")}</DialogTitle>
          <DialogDescription>
            {description ?? t("appAuditionsUploadMono.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">{t("appAuditionsUploadMono.fieldTitle")}</Label>
            <Input
              id="title"
              placeholder={t("appAuditionsUploadMono.titlePlaceholder")}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          {/* Character Name */}
          <div className="space-y-2">
            <Label htmlFor="character_name">{t("appAuditionsUploadMono.fieldCharacter")}</Label>
            <Input
              id="character_name"
              placeholder={t("appAuditionsUploadMono.characterPlaceholder")}
              value={formData.character_name}
              onChange={(e) => setFormData({ ...formData, character_name: e.target.value })}
              required
            />
          </div>

          {/* Play Info */}
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

          {/* Character Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="character_gender">{t("appAuditionsUploadMono.gender")}</Label>
              <Select
                value={formData.character_gender || "__none__"}
                onValueChange={(v) => setFormData({ ...formData, character_gender: v === "__none__" ? undefined : v })}
              >
                <SelectTrigger id="character_gender">
                  <SelectValue placeholder={t("appAuditionsUploadMono.selectGender")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("appAuditionsUploadMono.selectGender")}</SelectItem>
                  <SelectItem value="male">{t("appAuditionsUpload.male")}</SelectItem>
                  <SelectItem value="female">{t("appAuditionsUpload.female")}</SelectItem>
                  <SelectItem value="non-binary">{t("appAuditionsUpload.nonBinary")}</SelectItem>
                  <SelectItem value="any">{t("appAuditionsUpload.any")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="character_age_range">{t("appAuditionsUploadMono.age")}</Label>
              <Input
                id="character_age_range"
                placeholder={t("appAuditionsUploadMono.agePlaceholder")}
                value={formData.character_age_range || ""}
                onChange={(e) => setFormData({ ...formData, character_age_range: e.target.value })}
              />
            </div>
          </div>

          {/* Monologue Text */}
          <div className="space-y-2">
            <Label htmlFor="text">{t("appAuditionsUploadMono.text")}</Label>
            <Textarea
              id="text"
              placeholder={t("appAuditionsUploadMono.textPlaceholder")}
              value={formData.text}
              onChange={(e) => setFormData({ ...formData, text: e.target.value })}
              required
              rows={10}
              className="font-mono"
            />
          </div>

          {/* Stage Directions */}
          <div className="space-y-2">
            <Label htmlFor="stage_directions">{t("appAuditionsUploadMono.directions")}</Label>
            <Textarea
              id="stage_directions"
              placeholder={t("appAuditionsUploadMono.directionsPlaceholder")}
              value={formData.stage_directions || ""}
              onChange={(e) => setFormData({ ...formData, stage_directions: e.target.value })}
              rows={2}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t("appAuditionsUploadMono.notes")}</Label>
            <Textarea
              id="notes"
              placeholder={t("appAuditionsUploadMono.notesPlaceholder")}
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
                  {t("appAuditionsUploadMono.submit")}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
