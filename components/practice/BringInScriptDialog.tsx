"use client";

import { useRef, useState } from "react";
import { IconUpload } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** The extensions the server reads. A .docx is turned into text at the door. */
export const SCRIPT_ACCEPT = ".pdf,.docx,.txt";

/** Under this there is no scene to find; the server refuses it too. */
const MIN_PASTE_CHARS = 100;

interface BringInScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A picked file, or the pasted text wrapped as a .txt. Same pipeline either way. */
  onFile: (file: File) => void;
}

/**
 * The one way in for a script: a file, or the text pasted.
 *
 * The file picker used to open straight from the button, which left pasting
 * with nowhere to live. Sides arrive in an email body as often as an
 * attachment, so the box sits right under the file button.
 */
export function BringInScriptDialog({ open, onOpenChange, onFile }: BringInScriptDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");

  const close = () => {
    onOpenChange(false);
    setText("");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // reset so the same file can be re-selected later
    if (!file) return;
    close();
    onFile(file);
  };

  const usePasted = () => {
    const body = text.trim();
    if (body.length < MIN_PASTE_CHARS) return;
    // The time keeps the name unique: the shelf refuses a second script with
    // a filename it already holds.
    const stamp = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const file = new File([body], `Pasted script ${stamp.replace(/[/:]/g, ".")}.txt`, {
      type: "text/plain",
    });
    close();
    onFile(file);
  };

  const tooShort = text.trim().length < MIN_PASTE_CHARS;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Bring in a script</DialogTitle>
          <DialogDescription>PDF, Word or a text file. Or paste the scene below.</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept={SCRIPT_ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full gap-2 h-11 font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <IconUpload className="h-4 w-4" />
          Choose a file
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or paste it
          <span className="h-px flex-1 bg-border" />
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"MAYA\nYou're late.\n\nDAN\nI know. I know."}
          rows={8}
          className="text-sm max-h-[40vh]"
        />
        <Button type="button" variant="outline" onClick={usePasted} disabled={tooShort} className="w-full">
          Read this
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default BringInScriptDialog;
