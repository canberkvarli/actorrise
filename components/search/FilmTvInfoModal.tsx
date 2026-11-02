"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { withSlots } from "@/components/search/searchI18n";

export interface FilmTvInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilmTvInfoModal({ open, onOpenChange }: FilmTvInfoModalProps) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("appSearchFilmTv.infoTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            {withSlots(t("appSearchFilmTv.infoBody1"), {
              a: <em>{t("appSearchFilmTv.infoExampleA")}</em>,
              b: <em>{t("appSearchFilmTv.infoExampleB")}</em>,
              c: <em>{t("appSearchFilmTv.infoExampleC")}</em>,
            })}
          </p>
          <p>
            {t("appSearchFilmTv.infoBody2")}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {t("appSearchFilmTv.infoFairUse")}
          </p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => onOpenChange(false)}>{t("appSearchFilmTv.gotIt")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
