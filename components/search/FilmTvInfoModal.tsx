"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface FilmTvInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilmTvInfoModal({ open, onOpenChange }: FilmTvInfoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Film &amp; TV audition prep</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Search 14,000+ films and TV series to find the right piece for your audition.
            Use natural language — <em>"dark psychological thriller"</em>, <em>"villain monologue"</em>,
            or just a title like <em>"The Godfather"</em>.
          </p>
          <p>
            After you search, click a result to see details, then use the <strong>Script</strong> link
            to search for the script online (e.g. IMSDb or other sources). When available, <strong>Watch</strong> opens
            the clip on YouTube. We don&apos;t store script text — you open the original source.
          </p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
