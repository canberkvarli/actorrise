"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ChangelogEntry } from "@/lib/changelog";

interface ChangelogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ChangelogEntry;
  onDismiss: () => void;
}

export function ChangelogModal({ open, onOpenChange, entry, onDismiss }: ChangelogModalProps) {
  const router = useRouter();

  const handleTryItNow = () => {
    onDismiss();
    onOpenChange(false);
    if (entry.cta_link) {
      router.push(entry.cta_link);
    }
  };

  const handleDismiss = () => {
    onDismiss();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[400px] gap-4 p-6 rounded-2xl"
        onPointerDownOutside={handleDismiss}
        onEscapeKeyDown={handleDismiss}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold leading-tight flex items-center gap-2">
                  {entry.emoji && <span aria-hidden>{entry.emoji}</span>}
                  {entry.title}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {entry.description}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={handleDismiss} className="w-full sm:w-auto">
                  Dismiss
                </Button>
                {entry.cta_link && (
                  <Button size="sm" onClick={handleTryItNow} className="w-full sm:w-auto">
                    {entry.cta_text ?? "Try it now"}
                  </Button>
                )}
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
