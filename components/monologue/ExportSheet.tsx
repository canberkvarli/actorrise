"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Monologue } from "@/types/actor";
import { displayableAuthor } from "@/lib/utils";
import { estimateDurationSeconds, formatClock } from "@/lib/estimateDuration";

/**
 * Audition-ready export: the actor's CUT only (or the full piece if none set),
 * formatted clean and printable. Plain text first — Copy and Print ship now; a
 * PDF can earn its dependency later. The monologue itself renders in the
 * typewriter face because it is the piece, not UI chrome.
 */
export function ExportSheet({
  monologue,
  embedded = false,
}: {
  monologue: Monologue;
  /** Inside a labelled tab, skip the "Audition copy" heading — the tab said it. */
  embedded?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const source = useMemo(() => {
    const author = displayableAuthor(monologue.author);
    return [monologue.play_title, author].filter(Boolean).join(" · ");
  }, [monologue.play_title, monologue.author]);

  const cutText = useMemo(() => {
    const lines = (monologue.text ?? "").split("\n");
    const { cut_start_line: s, cut_end_line: e } = monologue;
    if (s === null || s === undefined || e === null || e === undefined) {
      return monologue.text ?? "";
    }
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    return lines.slice(lo, hi + 1).join("\n");
  }, [monologue]);

  const isCut =
    monologue.cut_start_line !== null &&
    monologue.cut_start_line !== undefined &&
    monologue.cut_end_line !== null &&
    monologue.cut_end_line !== undefined;

  const seconds = estimateDurationSeconds(cutText);

  const plainText = useMemo(() => {
    const header = [monologue.character_name, source ? `from ${source}` : ""]
      .filter(Boolean)
      .join(" ");
    return `${header}\n\n${cutText.trim()}\n`;
  }, [monologue.character_name, source, cutText]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select and copy manually.");
    }
  }

  function print() {
    const w = window.open("", "_blank", "width=680,height=800");
    if (!w) {
      toast.error("Allow pop-ups to print.");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!doctype html><html><head><title>${esc(
      monologue.character_name || "Monologue",
    )}</title><style>
      body{font-family:"Courier Prime",ui-monospace,monospace;margin:1in;color:#111;line-height:1.6;font-size:13pt}
      h1{font-size:15pt;margin:0 0 2pt}
      .src{color:#555;font-size:11pt;margin:0 0 24pt}
      pre{white-space:pre-wrap;font-family:inherit;font-size:13pt;margin:0}
    </style></head><body>
      <h1>${esc(monologue.character_name || "")}</h1>
      <p class="src">${esc(source)}</p>
      <pre>${esc(cutText.trim())}</pre>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          {!embedded && <h2 className="text-base font-semibold">Audition copy</h2>}
          <p className="text-sm text-muted-foreground">
            {isCut ? `Your cut · ${formatClock(seconds)}` : `Full piece · ${formatClock(seconds)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={print}>
            Print
          </Button>
        </div>
      </div>
      <div className="border border-border bg-background p-4">
        <p className="font-semibold text-foreground">{monologue.character_name}</p>
        {source && <p className="mb-3 text-sm text-muted-foreground">{source}</p>}
        <pre className="whitespace-pre-wrap font-typewriter text-sm leading-relaxed text-foreground">
          {cutText.trim()}
        </pre>
      </div>
    </div>
  );
}
