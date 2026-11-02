"use client";

/**
 * Delete Account Confirmation Modal
 *
 * Multi-step confirmation dialog for account deletion.
 * Requires checkbox confirmations and typing "DELETE" to proceed.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import api from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n";

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountModal({ open, onOpenChange }: DeleteAccountModalProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmSubscription, setConfirmSubscription] = useState(false);
  const [confirmData, setConfirmData] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const t = useT();
  const locale = useLocale();
  // The word to type is the reader's: DELETE in English, SİL in Turkish. The
  // field shows capitals, so Turkish is compared in Turkish capitals.
  const word = t("appAccountDelete.word");
  const typed = locale === "tr" ? deleteText.toLocaleUpperCase("tr-TR") : deleteText;

  const canDelete = confirmSubscription && confirmData && typed === word;

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    try {
      await api.post("/api/account/delete");
      await supabase.auth.signOut();
      toast.success(t("appAccountDelete.deleted"));
      router.push("/");
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        t("appAccountDelete.failed");
      toast.error(message);
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (isDeleting) return;
    onOpenChange(false);
    setConfirmSubscription(false);
    setConfirmData(false);
    setDeleteText("");
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-red-600">
            <IconAlertTriangle className="h-5 w-5" />
            <DialogTitle>{t("appAccountDelete.title")}</DialogTitle>
          </div>
          <DialogDescription asChild>
            <span className="sr-only">{t("appAccountDelete.srDescription")}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-foreground font-medium text-sm">{t("appAccountDelete.sure")}</p>

          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm space-y-2">
            <p className="font-medium text-red-800 dark:text-red-200">{t("appAccountDelete.thisWill")}</p>
            <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-1">
              <li>{t("appAccountDelete.will1")}</li>
              <li>{t("appAccountDelete.will2")}</li>
              <li>{t("appAccountDelete.will3")}</li>
              <li>{t("appAccountDelete.will4")}</li>
            </ul>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="confirm-subscription"
                checked={confirmSubscription}
                onChange={(e) => setConfirmSubscription(e.target.checked)}
                disabled={isDeleting}
              />
              <Label htmlFor="confirm-subscription" className="text-sm leading-normal cursor-pointer">
                {t("appAccountDelete.confirmSubscription")}
              </Label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="confirm-data"
                checked={confirmData}
                onChange={(e) => setConfirmData(e.target.checked)}
                disabled={isDeleting}
              />
              <Label htmlFor="confirm-data" className="text-sm leading-normal cursor-pointer">
                {t("appAccountDelete.confirmData")}
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete-confirm" className="text-sm">
                {t("appAccountDelete.typeA")}
                <strong>{word}</strong>
                {t("appAccountDelete.typeB")}
              </Label>
              <Input
                id="delete-confirm"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder={t("appAccountDelete.placeholder", { word })}
                disabled={isDeleting}
                className="uppercase"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={isDeleting} onClick={handleCancel}>
            {t("appAccountDelete.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <IconLoader2 className="h-4 w-4 animate-spin" />
                {t("appAccountDelete.deleting")}
              </>
            ) : (
              t("appAccountDelete.confirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
