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

  const canDelete = confirmSubscription && confirmData && deleteText === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    try {
      await api.post("/api/account/delete");
      await supabase.auth.signOut();
      toast.success("Your account has been successfully deleted.");
      router.push("/");
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        "Failed to delete account. Please try again or contact support.";
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
            <DialogTitle>Delete Account</DialogTitle>
          </div>
          <DialogDescription className="space-y-4 pt-2">
            <p className="text-foreground font-medium">
              Are you sure you want to delete your account?
            </p>

            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-red-800 dark:text-red-200">This will:</p>
              <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-1">
                <li>Permanently delete all your scripts, scenes, and bookmarks</li>
                <li>Cancel your subscription immediately (no refund)</li>
                <li>Remove access to all ActorRise features immediately</li>
                <li>This action cannot be undone</li>
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
                  I understand my subscription will be canceled immediately and I will lose access
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
                  I understand all my data will be permanently deleted
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delete-confirm" className="text-sm">
                  To confirm, type <strong>DELETE</strong> below:
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  disabled={isDeleting}
                  className="uppercase"
                />
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={isDeleting} onClick={handleCancel}>
            Cancel
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
                Deleting...
              </>
            ) : (
              "Permanently Delete Account"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
