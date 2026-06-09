"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface HelpVideoDialogProps {
  /** YouTube ID to play. When undefined, nothing renders. */
  youtubeId?: string;
  /** Accessible title for the dialog/iframe. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Controlled modal that plays a YouTube video at 16:9. Shared by the /help page
 * cards and contextual embeds (e.g. the Practice empty state).
 *
 * The iframe only mounts while open, so closing the dialog stops playback.
 */
export function HelpVideoDialog({
  youtubeId,
  title,
  open,
  onOpenChange,
}: HelpVideoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden border-0 bg-black">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          {open && youtubeId && (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
