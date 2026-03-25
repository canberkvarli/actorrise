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
            Search monologues from iconic films and TV series for your audition.
            Use natural language: <em>&ldquo;dark psychological thriller&rdquo;</em>, <em>&ldquo;villain monologue&rdquo;</em>,
            or just a title like <em>&ldquo;The Godfather&rdquo;</em>.
          </p>
          <p>
            Results include audition-ready monologue excerpts you can save, rehearse with ScenePartner, and
            film/TV reference cards with script links and metadata.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Monologue excerpts are provided under fair use for audition preparation.
            All content is attributed to the original writers.
          </p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
