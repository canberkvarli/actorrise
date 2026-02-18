"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { IconCheck } from "@tabler/icons-react";

const ISSUE_TYPES = [
  { value: "format_wrong", label: "Format looks wrong" },
  { value: "wrong_language", label: "Wrong language" },
  { value: "text_incomplete", label: "Text is incomplete" },
  { value: "wrong_info", label: "Wrong title or author" },
  { value: "copyright_issue", label: "Copyright issue" },
  { value: "other", label: "Something else" },
] as const;

export interface ReportMonologueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monologueId: number;
  characterName: string;
  playTitle: string;
}

export function ReportMonologueModal({
  open,
  onOpenChange,
  monologueId,
  characterName,
  playTitle,
}: ReportMonologueModalProps) {
  const [issueType, setIssueType] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setIssueType(null);
    setNotes("");
    setSending(false);
    setSent(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!issueType) return;
    setSending(true);
    try {
      await api.post(`/api/monologues/${monologueId}/report`, {
        issue_type: issueType,
        notes: notes.trim() || null,
      });
      setSent(true);
      setTimeout(() => {
        handleOpenChange(false);
      }, 2000);
    } catch {
      toast.error("Could not send report. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        {sent ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center">
              <IconCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">Got it, thanks!</p>
              <p className="text-sm text-muted-foreground mt-1">We will take a look and fix it.</p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report an issue</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {characterName} &middot; {playTitle}
              </p>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="flex flex-wrap gap-2">
                {ISSUE_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setIssueType(type.value)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      issueType === type.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-foreground hover:border-primary/60 hover:bg-primary/5"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <Textarea
                placeholder="Anything else? (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={3}
                className="resize-none text-sm"
              />

              <Button
                onClick={handleSubmit}
                disabled={!issueType || sending}
                className="w-full"
              >
                {sending ? "Sending..." : "Send report"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
